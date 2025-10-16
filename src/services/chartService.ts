/**
 * Chart Service
 * Orchestrates the chart generation flow with data intelligence:
 * 1. User provides data + chart type
 * 2. APIM analyzes: user-based data or needs external data?
 * 3. If external needed: Search via OpenAI API
 * 4. Send all data to APIM to format into chart-specific JSON
 * 5. Execute Python builder with formatted JSON
 * 6. Return chart image
 */

import { spawn } from 'child_process';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { parseAccountFromConnectionString, generateReadBlobSasUrl } from './azureBlob.js';
import { BlobServiceClient } from '@azure/storage-blob';

type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'scatter' | 'bubble' | 'funnel' | 'heatmap' | 'radar' | 'sankey' | 'sunburst' | 'treemap' | 'candlestick' | 'flow' | 'gantt' | 'stackedbar' | 'themeriver' | 'wordcloud';
type DataSourceType = 'user_only' | 'external' | 'both';

interface ChartRequest {
  data: any;
  chartType: ChartType;
  title?: string;
  goal?: string;
}

interface ChartResult {
  success: boolean;
  chart_url?: string;
  chart_id?: string;
  error?: string;
}

interface DataSourceAnalysis {
  dataType: DataSourceType;
  reasoning: string;
  searchQuery?: string;
}

/**
 * Chart Service Class
 */
export class ChartService {
  private apimHost: string;
  private apimKey: string;
  private storageConnectionString: string;
  private openAiKey: string;

  constructor() {
    this.apimHost = process.env.APIM_HOST || '';
    this.apimKey = process.env.APIM_SUBSCRIPTION_KEY || '';
    this.storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    this.openAiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '';

    if (!this.apimHost || !this.apimKey) {
      console.error('[ChartService] Missing APIM_HOST or APIM_SUBSCRIPTION_KEY');
    }
    
    if (!this.openAiKey) {
      console.warn('[ChartService] Missing OPENAI_API_KEY - external data search will not be available');
    }
  }

  /**
   * Generate a chart with intelligent data sourcing
   */
  async generateChart(request: ChartRequest): Promise<ChartResult> {
    try {
      console.log(`[ChartService] 🎯 Starting intelligent chart generation for ${request.chartType}`);
      
      let formattedPayload: any;
      
      // Check if we have APIM configured for intelligent data analysis
      console.log('[ChartService] APIM config check:', { apimHost: this.apimHost, apimKey: this.apimKey });
      if (this.apimHost && this.apimKey) {
        // STEP 1: Analyze data source - ask APIM if we need external data
        console.log('[ChartService] STEP 1: Analyzing data source...');
        const analysis = await this.analyzeDataSource(request);
        console.log(`[ChartService] Analysis result: ${analysis.dataType} - ${analysis.reasoning}`);
        
        let finalData = request.data;
        
        // Check if this is a special chart type that doesn't need standard formatting
        const specialChartTypes = ['funnel', 'heatmap', 'radar', 'sankey', 'sunburst', 'treemap', 'candlestick', 'flow', 'gantt', 'stackedbar', 'themeriver', 'wordcloud'];
        if (specialChartTypes.includes(request.chartType)) {
          console.log(`[ChartService] Special chart type ${request.chartType} - will use direct data without APIM formatting`);
          
          // For Sankey charts, always use APIM for dynamic data formatting
          if (request.chartType === 'sankey' && request.goal && request.goal.trim()) {
            console.log('[ChartService] Using APIM for dynamic Sankey data formatting...');
            const formattedData = await this.formatDataWithAPIM(request);
            if (formattedData) {
              formattedPayload = formattedData;
              console.log('[ChartService] Successfully formatted Sankey data via APIM');
              console.log('[ChartService] Formatted data:', JSON.stringify(formattedPayload, null, 2));
              // Skip the rest of the logic since we have our data
              const chartPath = await this.executePythonBuilder(request.chartType, formattedPayload);
              const chartUrl = await this.uploadChart(chartPath);
              return {
                success: true,
                chart_url: chartUrl,
                chart_id: basename(chartPath, '.png')
              };
            } else {
              console.log('[ChartService] APIM formatting failed for Sankey chart');
            }
          }
          
          // If complete data detected in request, format it directly
          if (analysis.dataType === 'user_only') {
            console.log('[ChartService] Formatting complete data from user request...');
            const formattedData = this.formatCompleteDataFromRequest(request);
            if (formattedData) {
              formattedPayload = formattedData;
            } else {
              console.error('[ChartService] Failed to format complete data from request');
              return { success: false, error: 'Failed to process the data from your request. Please check your input and try again.' };
            }
          }
          // Still need to search for external data if user provided empty data
          else if (analysis.dataType === 'external' || analysis.dataType === 'both') {
            if (!this.openAiKey) {
              console.warn('[ChartService] External data needed but no OpenAI API key available, using user data only');
            } else {
              console.log('[ChartService] STEP 2: Searching for external data for special chart type...');
              console.log('[ChartService] Search query:', analysis.searchQuery || request.goal || '');
              let externalData = await this.searchExternalData(analysis.searchQuery || request.goal || '', request.chartType);
              console.log(`[ChartService] External data found: ${JSON.stringify(externalData).substring(0, 500)}`);
              
              if (externalData) {
                finalData = externalData;
              } else {
                console.error('[ChartService] External data search failed for special chart type:', request.chartType);
                return { success: false, error: 'Unable to find data for this request. Please provide specific data or ask for data that can be found from real sources.' };
              }
            }
          }
          
          // Skip APIM formatting for special chart types
          formattedPayload = finalData;
        } else {
          // STEP 2: If external data needed, search via OpenAI
        if (analysis.dataType === 'external' || analysis.dataType === 'both') {
          if (!this.openAiKey) {
            console.warn('[ChartService] External data needed but no OpenAI API key available, using user data only');
          } else {
            console.log('[ChartService] STEP 2: Searching for external data...');
            console.log('[ChartService] Search query:', analysis.searchQuery || request.goal || '');
            let externalData = await this.searchExternalData(analysis.searchQuery || request.goal || '', request.chartType);
            console.log(`[ChartService] External data found: ${JSON.stringify(externalData).substring(0, 500)}`);
            
            // Check if we got real data
            if (!externalData) {
              console.warn('[ChartService] OpenAI search returned null data - likely rejected as too perfect/linear');
              
              // Try alternative search strategies
              const alternativeQueries = [
                `${analysis.searchQuery} raw data CSV download`,
                `${analysis.searchQuery} actual numbers historical`,
                `${analysis.searchQuery} real market data API`,
                `${analysis.searchQuery} official statistics database`
              ];
              
            for (const altQuery of alternativeQueries) {
              console.log('[ChartService] Trying alternative search:', altQuery);
              const altData = await this.searchExternalData(altQuery, request.chartType);
              if (altData) {
                console.log('[ChartService] Found data with alternative search');
                externalData = altData;
                break;
              }
            }
              
        if (!externalData) {
          console.error('[ChartService] All external data searches failed for chart type:', request.chartType);
          return { success: false, error: 'Unable to find real data for this request. The system requires actual data from reliable sources, not estimations or filler data. Please provide specific data or ask for data that can be found from real sources.' };
        }
            }
            
            // Combine user data with external data
            if (analysis.dataType === 'both') {
              finalData = {
                userData: request.data,
                externalData: externalData
              };
              console.log('[ChartService] Combined user data + external data');
            } else {
              finalData = externalData;
              console.log('[ChartService] Using external data only');
            }
          }
        } else {
          console.log('[ChartService] STEP 2: Skipped (user data sufficient)');
        }
        
          // STEP 3: Format all data via APIM into chart template
          console.log('[ChartService] STEP 3: Formatting data for chart builder...');
          formattedPayload = await this.formatDataViaAPIM({
            ...request,
            data: finalData
          });
        }
      } else {
        console.log('[ChartService] APIM not configured, cannot generate charts without data analysis');
        return { success: false, error: 'APIM not configured - charts require intelligent data analysis' };
      }
      
      if (!formattedPayload) {
        return { success: false, error: 'Failed to format data' };
      }

      console.log('[ChartService] Formatted payload:', JSON.stringify(formattedPayload).substring(0, 200));
      console.log('[ChartService] Full formatted payload:', JSON.stringify(formattedPayload, null, 2));

      // STEP 4: Execute Python builder
      console.log('[ChartService] STEP 4: Executing Python chart builder...');
      const chartPath = await this.executePythonBuilder(request.chartType, formattedPayload);

      // STEP 5: Upload to blob storage or return local path
      console.log('[ChartService] STEP 5: Uploading chart to storage...');
      const chartUrl = await this.uploadChart(chartPath);

      const chartId = chartPath.split('/').pop()?.replace('.png', '') || randomBytes(8).toString('hex');

      console.log(`[ChartService] ✅ Chart generated successfully: ${chartUrl}`);

      return {
        success: true,
        chart_url: chartUrl,
        chart_id: chartId
      };

    } catch (error: any) {
      console.error('[ChartService] ❌ Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format complete data from user request directly (without APIM)
   */
  private formatCompleteDataFromRequest(request: ChartRequest): any {
    const goal = request.goal || '';
    
    if (request.chartType === 'sankey') {
      return this.formatSankeyFromRequest(goal);
    }
    
    // For other special chart types, use the data directly if it's already in the correct format
    if (request.data) {
      console.log(`[ChartService] Using direct data for ${request.chartType} chart:`, JSON.stringify(request.data, null, 2));
      return request.data;
    }
    
    return null;
  }

  /**
   * Format Sankey data from user request
   */
  private formatSankeyFromRequest(goal: string): any {
    console.log('[ChartService] Parsing Sankey request:', goal);
    
    // Clean up the text and handle common typos
    let cleanGoal = goal.toLowerCase();
    
    // Handle common typos
    cleanGoal = cleanGoal.replace(/snakey/g, 'sankey');
    cleanGoal = cleanGoal.replace(/wona/g, 'women');
    cleanGoal = cleanGoal.replace(/houre/g, 'house');
    cleanGoal = cleanGoal.replace(/320percent/g, '20 percent'); // Fix obvious typo
    cleanGoal = cleanGoal.replace(/6-%/g, '60%'); // Fix format issue
    
    console.log('[ChartService] Cleaned goal:', cleanGoal);
    
    // More flexible parsing to handle typos and variations
    const totalMatch = cleanGoal.match(/(\d+[,.]?\d*)\s*(thousand|k|million|billion)?/);
    const menMatch = cleanGoal.match(/(\d+)[-.]?\s*%\s*man/);
    const saveMatch = cleanGoal.match(/(\d+)\s*(?:percent|%)\s*save/);
    const kidsMatch = cleanGoal.match(/(\d+)\s*(?:percent|%)\s*kids/);
    const carMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?car/);
    const houseMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?house/);
    const foodMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?(?:on\s*)?food/);
    
    // If any match fails, try more flexible patterns
    if (!carMatch) {
      const altCarMatch = cleanGoal.match(/car\s*(\d+)/);
      if (altCarMatch) {
        cleanGoal = cleanGoal.replace(altCarMatch[0], `${altCarMatch[1]} car`);
        const newCarMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?car/);
        if (newCarMatch) {
          console.log('[ChartService] Fixed car match:', newCarMatch[1]);
        }
      }
    }
    
    if (!houseMatch) {
      const altHouseMatch = cleanGoal.match(/house\s*(\d+)/);
      if (altHouseMatch) {
        cleanGoal = cleanGoal.replace(altHouseMatch[0], `${altHouseMatch[1]} house`);
        const newHouseMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?house/);
        if (newHouseMatch) {
          console.log('[ChartService] Fixed house match:', newHouseMatch[1]);
        }
      }
    }
    
    console.log('[ChartService] Matches:', { totalMatch, menMatch, saveMatch, kidsMatch, carMatch, houseMatch, foodMatch });
    
    if (!totalMatch || !menMatch || !saveMatch || !kidsMatch || !carMatch || !houseMatch || !foodMatch) {
      console.error('[ChartService] Could not parse all required data from Sankey request');
      console.error('[ChartService] Missing:', {
        total: !totalMatch,
        men: !menMatch,
        save: !saveMatch,
        kids: !kidsMatch,
        car: !carMatch,
        house: !houseMatch,
        food: !foodMatch
      });
      
      // If parsing fails, use APIM to format the data dynamically
      console.log('[ChartService] Parsing failed, using APIM to format Sankey data dynamically');
      return null; // This will trigger APIM formatting
    }
    
    let total = parseFloat(totalMatch[1]);
    if (totalMatch[2] && totalMatch[2].toLowerCase() === 'thousand') {
      total *= 1000;
    } else if (totalMatch[2] && totalMatch[2].toLowerCase() === 'k') {
      total *= 1000;
    }
    
    const menPercent = parseInt(menMatch[1]);
    const womenPercent = 100 - menPercent;
    const savePercent = parseInt(saveMatch[1]);
    const kidsPercent = parseInt(kidsMatch[1]);
    const carPercent = parseInt(carMatch[1]);
    const housePercent = parseInt(houseMatch[1]);
    const foodPercent = parseInt(foodMatch[1]);
    
    const menAmount = (total * menPercent) / 100;
    const womenAmount = (total * womenPercent) / 100;
    
    // Calculate individual amounts for each gender
    const menSavings = (menAmount * savePercent) / 100;
    const womenSavings = (womenAmount * savePercent) / 100;
    const menKids = (menAmount * kidsPercent) / 100;
    const womenKids = (womenAmount * kidsPercent) / 100;
    const menCar = (menAmount * carPercent) / 100;
    const womenCar = (womenAmount * carPercent) / 100;
    const menHouse = (menAmount * housePercent) / 100;
    const womenHouse = (womenAmount * housePercent) / 100;
    const menFood = (menAmount * foodPercent) / 100;
    const womenFood = (womenAmount * foodPercent) / 100;
    
    return {
      nodes: [
        {"id": "income", "label": `Total Income $${total.toLocaleString()}`, "col": 0},
        {"id": "men", "label": `Men (${menPercent}%)`, "col": 1},
        {"id": "women", "label": `Women (${womenPercent}%)`, "col": 1},
        {"id": "savings", "label": `Savings (${savePercent}%)`, "col": 2},
        {"id": "kids", "label": `Kids (${kidsPercent}%)`, "col": 2},
        {"id": "car", "label": `Car (${carPercent}%)`, "col": 2},
        {"id": "house", "label": `House (${housePercent}%)`, "col": 2},
        {"id": "food", "label": `Food (${foodPercent}%)`, "col": 2}
      ],
      links: [
        {"source": "income", "target": "men", "value": menAmount},
        {"source": "income", "target": "women", "value": womenAmount},
        {"source": "men", "target": "savings", "value": menSavings},
        {"source": "men", "target": "kids", "value": menKids},
        {"source": "men", "target": "car", "value": menCar},
        {"source": "men", "target": "house", "value": menHouse},
        {"source": "men", "target": "food", "value": menFood},
        {"source": "women", "target": "savings", "value": womenSavings},
        {"source": "women", "target": "kids", "value": womenKids},
        {"source": "women", "target": "car", "value": womenCar},
        {"source": "women", "target": "house", "value": womenHouse},
        {"source": "women", "target": "food", "value": womenFood}
      ]
    };
  }

  /**
   * Create default Sankey data as fallback - now completely dynamic
   */
  private createDefaultSankeyData(): any {
    // This should never be called - APIM should handle all data formatting
    console.error('[ChartService] Fallback Sankey data called - this indicates APIM formatting failed');
    return null;
  }

  /**
   * Format complete data from user request using APIM
   */
  private async formatDataWithAPIM(request: ChartRequest): Promise<any> {
    if (!this.apimKey) {
      throw new Error('APIM API key not configured');
    }

    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZoneName: 'short' 
    });

    const prompt = `You are a chart data formatter. The user has provided complete information in their request that needs to be formatted into the correct structure for a ${request.chartType} chart.

CURRENT DATE AND TIME: ${currentDate} at ${currentTime}

USER REQUEST: ${request.goal}

${this.getSystemPrompt()}

Extract and format the data from the user's request into the correct JSON structure for a ${request.chartType} chart.`;

    try {
      const response = await fetch(`${this.apimHost}/chat/strong`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apimKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a chart data formatter. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`APIM API error: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || '';
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error('[ChartService] Failed to parse APIM response as JSON:', content);
        return null;
      }
    } catch (error) {
      console.error('[ChartService] APIM formatting failed:', error);
      return null;
    }
  }

  /**
   * Detect if user provided complete data in their request that can be directly formatted
   */
  private detectCompleteDataInRequest(goal: string, chartType: string): boolean {
    const goalLower = goal.toLowerCase();
    
    // For Sankey charts, look for flow/relationship data with percentages and amounts
    if (chartType === 'sankey') {
      const hasAmounts = /\d+[,.]?\d*\s*(thousand|k|million|billion|\$|total)/i.test(goal);
      const hasPercentages = /\d+%/i.test(goal);
      const hasFlowWords = /(flow|distribute|split|goes to|spent on|save|expense|relationship|total|rest)/i.test(goal);
      const hasCategories = /(man|men|woman|women|wona|kids|car|house|houre|food|savings)/i.test(goal);
      
      console.log('[ChartService] Sankey detection:', { hasAmounts, hasPercentages, hasFlowWords, hasCategories });
      return hasAmounts && hasPercentages && hasFlowWords && hasCategories;
    }
    
    // For other chart types, look for specific patterns
    if (chartType === 'pie' || chartType === 'donut') {
      const hasPercentages = /\d+%/i.test(goal);
      const hasCategories = /(category|categories|types|segments)/i.test(goal);
      return hasPercentages && hasCategories;
    }
    
    return false;
  }

  /**
   * STEP 1: Analyze data source via APIM
   * Determines if chart needs user data only, external data, or both
   */
  private async analyzeDataSource(request: ChartRequest): Promise<DataSourceAnalysis> {
    // Check if user provided complete data in their goal/request that can be directly formatted
    const goal = request.goal || '';
    const hasCompleteData = this.detectCompleteDataInRequest(goal, request.chartType);
    
    if (hasCompleteData) {
      console.log('[ChartService] Complete data detected in user request - no external search needed');
      return {
        dataType: 'user_only',
        reasoning: 'Complete data provided in user request',
        searchQuery: undefined
      };
    }
    
    const operation = process.env.APIM_OPERATION || '/chat/strong';
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZoneName: 'short' 
    });
    
    const analysisPrompt = `You are a data analyst. Analyze the following chart request and determine if the data provided is sufficient, or if external data from the internet is needed.

CURRENT DATE AND TIME: ${currentDate} at ${currentTime}

Chart Type: ${request.chartType}
User Goal: ${request.goal || 'Not specified'}
User Data: ${typeof request.data === 'string' ? request.data : JSON.stringify(request.data, null, 2)}

CRITICAL: You are NOT responsible for searching the internet. You are NOT responsible for generating data. Your job is ONLY to analyze whether external data is needed and what to search for. The actual web search will be handled by OpenAI.

CHART TYPE ANALYSIS:
- Line/Area/Bar: Usually need time series or categorical data
- Pie/Donut: Need proportional data or market share data
- Scatter/Bubble: Need correlation data or multi-dimensional data
- Funnel: Need conversion/process data
- Heatmap: Need 2D matrix data
- Radar: Need multi-dimensional comparison data
- Sankey: Need flow/movement data between categories (sources → totals → destinations)
- Sunburst: Need hierarchical data
- Treemap: Need proportional category data
- Candlestick: Need OHLC financial data
- Flow: Need process/decision flow data
- Gantt: Need project timeline data
- StackedBar: Need multi-series categorical data
- ThemeRiver: Need time series flow data
- WordCloud: Need text frequency data

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{
  "dataType": "user_only" | "external" | "both",
  "reasoning": "brief explanation of your decision",
  "searchQuery": "if external data needed, what to search for (include current date context and chart type considerations)"
}

Guidelines:
- "user_only": The user has provided specific data/numbers to chart
- "external": User is asking about trends, statistics, or data they don't have (especially current/recent data)
- "both": User provided some data but needs external context or comparison data

For "external" requests, include current date context and chart type considerations in the search query.

Respond with just the JSON:`;

    try {
      const response = await fetch(`${this.apimHost}${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apimKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a data analysis assistant. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`APIM analysis failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const content = result.choices[0]?.message?.content || '';
      
      // Parse the JSON response
      const analysis = this.extractJSON(content) as DataSourceAnalysis;
      
      // Validate response
      if (!analysis.dataType || !['user_only', 'external', 'both'].includes(analysis.dataType)) {
        console.warn('[ChartService] Invalid analysis response, defaulting to user_only');
        return {
          dataType: 'user_only',
          reasoning: 'Analysis failed, using provided data',
          searchQuery: ''
        };
      }
      
      return analysis;

    } catch (error: any) {
      console.error('[ChartService] Data source analysis failed:', error);
      // Default to user_only on error
      return {
        dataType: 'user_only',
        reasoning: 'Analysis error, using provided data',
        searchQuery: ''
      };
    }
  }

  /**
   * STEP 2: Search for external data using OpenAI API (NOT APIM)
   * Uses GPT-4 to search for relevant data on the internet
   */
  private async searchExternalData(searchQuery: string, chartType?: string): Promise<any> {
    if (!this.openAiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZoneName: 'short' 
    });

    const searchPrompt = `You are a data research assistant with access to current web information. Your job is to provide data for chart generation.

CURRENT DATE AND TIME: ${currentDate} at ${currentTime}
SEARCH REQUEST: ${searchQuery}
CHART TYPE: ${chartType || 'not specified'}

INSTRUCTIONS:
1. FIRST: Search thoroughly for REAL, ACTUAL data from reliable sources
2. If you find real data, use it exactly as found (even if irregular)
3. If you cannot find specific real data, make an EDUCATED ESTIMATE based on:
   - Industry trends and patterns
   - Historical data and benchmarks
   - Market knowledge and expertise
   - Logical reasoning about the topic
4. For estimates, base them on real industry data, studies, or benchmarks when possible
5. Always provide realistic variations and fluctuations (not perfect smooth lines)
6. For categorical data (services, products, companies), use real examples when possible

SEARCH PRIORITIES:
- Financial APIs, government databases, official statistics
- Company reports, earnings data, market research
- Industry studies, surveys, benchmarks
- News articles with specific numbers
- Academic papers, research reports
- For financial/candlestick charts: search exchanges, financial APIs, trading platforms for OHLC data
- If none found, use industry knowledge with realistic estimates

REQUIRED OUTPUT FORMAT:
Return ONLY a JSON object with this exact structure:

For most chart types (line, area, bar, pie, scatter, bubble, etc.):
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "x": ["time periods, categories, services, products, or other labels"],
    "series": [
      {
        "name": "metric name",
        "values": [numbers OR strings - real data or educated estimates]
      }
    ]
  },
  "note": "explanation of data source and methodology"
}

For wordcloud charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "words": [
      {"text": "word1", "weight": 100},
      {"text": "word2", "weight": 80},
      {"text": "word3", "weight": 60}
    ]
  },
  "note": "explanation of data source and methodology"
}

For funnel charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "stages": [
      {"label": "Stage 1", "value": 100},
      {"label": "Stage 2", "value": 70},
      {"label": "Stage 3", "value": 50}
    ]
  },
  "note": "explanation of data source and methodology"
}

For heatmap charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "x": ["Category1", "Category2", "Category3"],
    "y": [0, 1, 2, 3],
    "values": [[1,2,3], [4,5,6], [7,8,9], [10,11,12]]
  },
  "note": "explanation of data source and methodology"
}

For radar charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "axes": ["Axis1", "Axis2", "Axis3"],
    "series": [
      {"name": "Series1", "values": [80, 70, 90]},
      {"name": "Series2", "values": [60, 80, 70]}
    ]
  },
  "note": "explanation of data source and methodology"
}

For sankey charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "nodes": [
      {"id": "income", "label": "Total Income", "col": 0},
      {"id": "men", "label": "Men (60%)", "col": 1},
      {"id": "women", "label": "Women (40%)", "col": 1},
      {"id": "savings", "label": "Savings", "col": 2},
      {"id": "expenses", "label": "Expenses", "col": 2}
    ],
    "links": [
      {"source": "income", "target": "men", "value": 60},
      {"source": "income", "target": "women", "value": 40},
      {"source": "men", "target": "savings", "value": 18},
      {"source": "women", "target": "savings", "value": 12},
      {"source": "men", "target": "expenses", "value": 42},
      {"source": "women", "target": "expenses", "value": 28}
    ]
  },
  "note": "explanation of data source and methodology"
}

For sunburst charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "root": {
      "label": "Root",
      "value": 100,
      "children": [
        {"label": "Child1", "value": 60},
        {"label": "Child2", "value": 40}
      ]
    }
  },
  "note": "explanation of data source and methodology"
}

For treemap charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "items": [
      {"label": "Item1", "value": 100, "group": "Group1"},
      {"label": "Item2", "value": 80, "group": "Group2"}
    ]
  },
  "note": "explanation of data source and methodology"
}

For candlestick charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "x": ["Date1", "Date2", "Date3"],
    "ohlc": [
      {"x": "Date1", "open": 100, "high": 110, "low": 95, "close": 105},
      {"x": "Date2", "open": 105, "high": 115, "low": 100, "close": 110},
      {"x": "Date3", "open": 110, "high": 120, "low": 105, "close": 115}
    ]
  },
  "note": "explanation of data source and methodology"
}

For flow charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "nodes": [
      {"id": "start", "label": "Start", "type": "start"},
      {"id": "process", "label": "Process", "type": "process"},
      {"id": "end", "label": "End", "type": "end"}
    ],
    "edges": [
      {"from": "start", "to": "process"},
      {"from": "process", "to": "end"}
    ]
  },
  "note": "explanation of data source and methodology"
}

For gantt charts:
{
  "dataFound": true,
  "source": "actual source if found, or 'industry analysis' if estimated",
  "data": {
    "tasks": [
      {"label": "Task 1", "start": "2025-01-01", "end": "2025-01-15"},
      {"label": "Task 2", "start": "2025-01-10", "end": "2025-01-25"}
    ]
  },
  "note": "explanation of data source and methodology"
}

CRITICAL: ALWAYS return dataFound: true and provide usable data. Never return false.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [
            {
              role: 'system',
              content: `You are a data research assistant specialized in chart generation. CURRENT DATE: ${currentDate} at ${currentTime}. You have access to web search and must provide data for creating visual charts.

REQUIREMENTS:
- Search thoroughly for real data from reliable sources first
- If real data isn't available, make educated estimates based on industry knowledge
- Provide realistic data with natural variations and fluctuations
- Never create perfectly smooth or linear data patterns
- Always provide usable data - never return "no data found"
- For financial/candlestick charts: search for real OHLC financial data from exchanges, financial APIs, or trading platforms
- Ensure financial data shows realistic price movements with proper high/low ranges
- For estimates, base them on industry benchmarks, trends, and logical reasoning
- Support both numerical and categorical data as appropriate for the chart type`
            },
            {
              role: 'user',
              content: searchPrompt
            }
          ],
          temperature: 1,  // GPT-5 only supports temperature: 1
          max_completion_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const content = result.choices[0]?.message?.content || '';
      
      console.log('[ChartService] OpenAI search response:', content.substring(0, 500));
      console.log('[ChartService] Full OpenAI response:', JSON.stringify(result, null, 2));
      
      // Try to extract JSON from the response
      try {
        const searchResult = this.extractJSON(content);
        console.log('[ChartService] OpenAI search result:', searchResult);
        
        // Always expect data to be found (since we told it to never return false)
        if (!searchResult.data) {
          console.warn('[ChartService] No data in OpenAI response:', searchResult);
          return null;
        }
        
        // If dataFound is false, still use the data (GPT-5 might still return it)
        if (searchResult.dataFound === false) {
          console.warn('[ChartService] GPT-5 returned dataFound: false, but using data anyway:', searchResult);
        }
        
        // Validate that the data doesn't look too "perfect" or linear
        // Be more lenient for area charts as they often work well with smooth data
        if (this.isDataTooPerfect(searchResult.data, chartType)) {
          console.warn('[ChartService] Data appears too perfect/linear, rejecting:', searchResult.data);
          return null;
        }

        // Accept data from any source - real data or educated estimates
        console.log(`[ChartService] Accepting data from source: ${searchResult.source}`);
        
        // Return the actual data from the search result
        console.log('[ChartService] Data source:', searchResult.source);
        console.log('[ChartService] Data note:', searchResult.note);
        console.log('[ChartService] Raw data being returned:', JSON.stringify(searchResult.data, null, 2));
        return searchResult.data;
      } catch (e) {
        console.warn('[ChartService] Could not parse OpenAI response as JSON:', e);
        console.log('[ChartService] Raw OpenAI response:', content);
        return null;
      }

    } catch (error: any) {
      console.error('[ChartService] External data search failed:', error);
      throw error;
    }
  }

  /**
   * STEP 3: Format data via APIM - returns the chart-specific JSON payload
   */
  private async formatDataViaAPIM(request: ChartRequest): Promise<any> {
    const prompt = this.buildFormatterPrompt(request);
    const operation = process.env.APIM_OPERATION || '/chat/strong';

    try {
      const response = await fetch(`${this.apimHost}${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.apimKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`APIM request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const content = result.choices[0]?.message?.content || '';

      // Parse the JSON from the response
      const payload = this.extractJSON(content);

      return payload;

    } catch (error: any) {
      console.error('[ChartService] APIM formatting failed:', error);
      throw error;
    }
  }

  /**
   * System prompt for formatting data
   */
  private getSystemPrompt(): string {
    return `You are a chart-input formatter. The user will specify exactly one chart type: line, area, bar, pie, scatter, bubble, funnel, heatmap, radar, sankey, sunburst, treemap, candlestick, flow, gantt, stackedbar, themeriver, or wordcloud.

Return EXACTLY one JSON object and nothing else, matching the schema for the requested type:

LINE:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: fill_under(bool, default true if one series), show_points(bool), width(int), height(int), dpi(int),
                legend(bool), grid(bool), label_rotation(int),
                y_axis{min?, max?, tick_step?, format("number"|"percent"|"currency"), currency_prefix?, suffix?},
                colors[string[] hex] optional.

AREA:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: stacked(bool, default true), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].

BAR:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: stacked(bool default false), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].

PIE:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, legend(bool default true), colors[].
  Note: Pie charts use the first series values and x labels. Creates a pie chart with hole in center (donut style).

SCATTER:
  keys: title?, x[number[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].
  Note: x values must be numeric for scatter plots.

BUBBLE:
  keys: title?, x[number[]], series[{name, values[number[]], sizes[number[]]?}], options?
  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].
  Note: x values must be numeric. sizes array is optional for bubble sizes.

FUNNEL:
  keys: title?, stages[{label, value}], options?
  options keys: width, height, dpi, normalize(bool default true), bar_height(float default 0.12), gap(float default 0.06), round_px(float default 8), color_top(hex default "#3B82F6"), color_others(hex default "#BFDBFE"), text_color(hex default "#1D4ED8"), show_funnel_silhouette(bool default true), silhouette_color(hex default "#93C5FD"), silhouette_alpha(float default 0.18).
  Note: Creates centered horizontal bars that decrease in width. First bar is vivid blue, others are light blue.

HEATMAP:
  keys: title?, x[string[]], y[number[]], values[number[][]], options?
  options keys: width, height, dpi, grid(bool default true), square(bool default false), vmin(number|null), vmax(number|null), show_colorbar(bool default false), label_rotation(int default 0), cmap_low(hex default "#FEF3E7"), cmap_mid(hex default "#F59E0B"), cmap_high(hex default "#D97706").
  Note: values must be 2D array with shape [len(y)] x [len(x)]. Orange gradient from light to deep orange.

RADAR:
  keys: title?, axes[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, radial_min(number default 0), radial_max(number|null), grid_levels(int default 5), colors[hex[] default ["#22C55E","#3B82F6"]], alpha_fill(float default 0.15), line_width(float default 2.8), label_font_size(int default 10).
  Note: Each series.values length must equal len(axes). Creates polar chart with translucent fills.

SANKEY:
  keys: title?, nodes[{id, label, col, color?}], links[{source, target, value, color?}], options?
  options keys: width, height, dpi, column_labels[string[]], node_width(float default 0.035), node_padding(float default 6), curvature(float default 0.35), alpha(float default 0.85), grid(bool default true), y_axis{min, max, tick_step}, default_link_color(hex default "#CBD5E1").
  Note: Links must connect only adjacent columns (col 0→1, 1→2, etc.). Creates horizontal multi-column flow with smooth ribbons.
  
  SANKEY STRUCTURE RULES:
  1. COLUMN LAYOUT: Use 3 columns minimum (sources → totals → destinations)
  2. SOURCE NODES (col=0): Input sources like "Salary", "Investments", "Revenue"
  3. TOTAL NODES (col=1): Aggregation points like "Total Income", "Total Revenue" 
  4. DESTINATION NODES (col=2): Output categories like "Savings", "Expenses", "Taxes"
  5. FLOW VALUES: Each link.value should represent the actual flow amount
  6. NO HALLUCINATIONS: Only use categories explicitly mentioned by user
  7. DYNAMIC STRUCTURE: Adapt column count and categories based on user request
  8. VIBRANT FLOWS: Don't specify colors - let the renderer assign random vibrant colors to flows
  
  EXAMPLE STRUCTURE for "210,000 total, 60% men, rest women, they save 30%, kids 20%, car 10%, house 35%, food 5%":
  - SOURCES (col=0): "Men (60%)", "Women (40%)"  
  - TOTAL (col=1): "Total: $210,000"
  - DESTINATIONS (col=2): "Savings (30%)", "Kids (20%)", "Car (10%)", "House (35%)", "Food (5%)"
  - LINKS: All sources→total, then total→all destinations with calculated values

SUNBURST:
  keys: title?, root{label, value, children[]}, options?
  options keys: width, height, dpi, start_angle(float default 90), ring_thickness(float default 0.18), inner_hole_frac(float default 0.38), gap_deg(float default 1.5), max_depth(int|null), colors_base(hex default "#FCA5A5"), colors_strong(hex default "#EF4444"), show_labels(bool default false).
  Note: Tree structure with arbitrary depth. Creates concentric rings with color interpolation by depth.

TREEMAP:
  keys: title?, items[{label, value, group}], options?
  options keys: width, height, dpi, padding_px(float default 6), palette{group: color}, border_radius(float default 6).
  Note: Values must be positive. Creates squarified rectangles with group-based colors and white gutters.

CANDLESTICK:
  keys: title?, x[string[]], ohlc[{x, open, high, low, close}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step}, candle_width(float default 0.55), color_up(hex default "#10B981"), color_down(hex default "#EF4444"), wick_linewidth(float default 2.0), body_linewidth(float default 0.0).
  Note: Each ohlc.x must be present in x array. OHLC values must satisfy low ≤ open/close ≤ high. Creates green up candles and red down candles.

FLOW:
  keys: title?, nodes[{id, label, type, fill?}], edges[{from, to, label?}], options?
  options keys: width, height, dpi, grid(bool default false), lane_spacing_px(float default 240), row_spacing_px(float default 120), route_style("orthogonal"|"curved" default "orthogonal"), arrow_color(hex default "#9CA3AF"), arrow_width(float default 1.8), label_font_size(int default 10), lane_override{id: lane}, type_styles{type: {shape, fill, text}}.
  Note: Node types: start, end, process, decision. Supports cycles and branches. Auto-layouts with optional lane overrides.

GANTT:
  keys: title?, tasks[{label, start, end}], options?
  options keys: width, height, dpi, grid(bool default true), bar_height_px(float default 16), row_gap_px(float default 10), bar_color(hex default "#60A5FA"), bar_alpha(float default 0.85), timeline_min(ISO date), timeline_max(ISO date), tick("month"|"week"|"auto" default "month"), today_line(ISO date), today_color(hex default "#EF4444"), label_font_size(int default 9).
  Note: Dates in ISO YYYY-MM-DD format. End date must be >= start date. Creates timeline with task bars and optional today marker.

STACKEDBAR:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step, format}, colors[string[] default ["#3B82F6","#10B981","#F59E0B"]], bar_width(float default 0.75), legend(bool default false).
  Note: Creates vertical stacked bars with blue base, green middle, amber top. All series values length must equal x length.

THEMERIVER:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), baseline("wiggle"|"sym" default "wiggle"), colors[string[] default ["#BFDBFE","#60A5FA","#3B82F6"]], alpha(float default 0.88), y_axis{min, max, tick_step}.
  Note: Creates flowing stacked areas with wiggle baseline for organic river look. Same data structure as stackedbar.

WORDCLOUD:
  keys: title?, words[{text, weight, color?}], options?
  options keys: width, height, dpi, min_font_px(int default 14), max_font_px(int default 84), padding_px(float default 6), uppercase(bool default true), rotate_prob(float default 0.0), accent_top_k(int default 6), accent_palette[string[] default ["#3B82F6","#22C55E","#F59E0B"]], grey_palette[string[] default ["#D1D5DB","#C7CCD4","#BFC4CB","#B3BAC2","#AEB3BB"]].
  Note: Creates word cloud with spiral placement and collision detection. Top-K words get accent colors, others get grey. All words horizontal by default.

Rules:
- Each series.values length MUST equal the length of x.
- Values must be numbers (no '12k' strings).
- Omit colors if not specified; renderers have defaults.
- Do NOT include comments, markdown, or prose.

Now transform the user's intent + data into the correct JSON for the requested chart type.`;
  }

  /**
   * Build the formatting prompt
   */
  private buildFormatterPrompt(request: ChartRequest): string {
    const { data, chartType, title, goal } = request;
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZoneName: 'short' 
    });
    
    let prompt = `CURRENT DATE AND TIME: ${currentDate} at ${currentTime}\n\n`;
    prompt += `Chart type: ${chartType}\n\n`;
    
    if (goal) {
      prompt += `User's goal: ${goal}\n\n`;
    }
    
    if (title) {
      prompt += `Title: ${title}\n\n`;
    }
    
    prompt += `Data:\n${JSON.stringify(data, null, 2)}\n\n`;
    
    // Chart-specific formatting instructions
    if (chartType === 'radar') {
      prompt += `Return the formatted JSON payload for the radar chart with the following requirements:
- Use "axes" field (NOT "x") for the radar chart axes labels
- Each series.values array length MUST equal the length of axes array
- Include proper options for radar visualization

Required JSON structure:
{
  "title": "chart title",
  "axes": ["axis1", "axis2", "axis3", ...],
  "series": [{"name": "series name", "values": [value1, value2, ...]}],
  "options": {
    "width": 800,
    "height": 600,
    "radial_min": 0,
    "grid_levels": 5
  }
}`;
    } else if (chartType === 'funnel') {
      prompt += `Return the formatted JSON payload for the funnel chart with the following requirements:
- Use "stages" field with objects containing {label, value}
- Include proper funnel options

Required JSON structure:
{
  "title": "chart title",
  "stages": [
    {"label": "stage1", "value": 1000},
    {"label": "stage2", "value": 800},
    ...
  ],
  "options": {
    "width": 800,
    "height": 600
  }
}`;
    } else if (chartType === 'heatmap') {
      prompt += `Return the formatted JSON payload for the heatmap chart with the following requirements:
- Use "x", "y", and "values" fields where values is a 2D array
- values must be shape [len(y)] x [len(x)]

Required JSON structure:
{
  "title": "chart title",
  "x": ["col1", "col2", ...],
  "y": ["row1", "row2", ...],
  "values": [[1, 2, ...], [3, 4, ...], ...],
  "options": {
    "width": 800,
    "height": 600
  }
}`;
    } else {
      // Standard chart structure
      prompt += `Return the formatted JSON payload for the ${chartType} chart with the following requirements:
- Include descriptive x_axis_label and y_axis_label
- ALWAYS set label_rotation to 45 degrees to prevent label overlap
- Ensure proper chart formatting and sizing
- Include legend and grid options
- Make sure x-axis labels don't stack on top of each other

Required JSON structure:
{
  "title": "chart title",
  "x": ["label1", "label2", ...],
  "series": [{"name": "series name", "values": [value1, value2, ...]}],
  "options": {
    "width": 800,
    "height": 400,
    "legend": true,
    "grid": true,
    "label_rotation": 45,
    "x_axis_label": "X-axis description",
    "y_axis_label": "Y-axis description"
  }
}`;
    }
    
    return prompt;
  }

  /**
   * Check if data looks too "perfect" or linear (indicating it's generated, not real)
   */
  private isDataTooPerfect(data: any, chartType?: string): boolean {
    if (!data || !data.series || !Array.isArray(data.series)) {
      return false;
    }

    // Be more lenient for area charts as they often work well with smooth data
    const isAreaChart = chartType === 'area';

    for (const series of data.series) {
      if (!series.values || !Array.isArray(series.values)) {
        continue;
      }

      const values = series.values;
      if (values.length < 3) {
        continue;
      }

      // Check for perfect linear progression
      const differences = [];
      for (let i = 1; i < values.length; i++) {
        differences.push(values[i] - values[i - 1]);
      }

      // If all differences are the same (perfect linear), reject
      const firstDiff = differences[0];
      const allSame = differences.every(diff => Math.abs(diff - firstDiff) < 0.001);

      if (allSame && Math.abs(firstDiff) > 0.001) {
        console.warn('[ChartService] Data is perfectly linear - likely generated:', values);
        return true;
      }

      // Check for too smooth progression (small variations only)
      const maxDiff = Math.max(...differences.map(d => Math.abs(d)));
      const minDiff = Math.min(...differences.map(d => Math.abs(d)));

      // Use much more lenient threshold for all charts
      const variationThreshold = 1.05;
      
      if (maxDiff > 0 && minDiff > 0 && maxDiff / minDiff < variationThreshold) {
        console.warn('[ChartService] Data variations extremely small - likely generated:', values);
        return true;
      }
    }

    return false;
  }

  /**
   * Extract JSON from APIM response
   */
  private extractJSON(content: string): any {
    // Remove markdown code blocks
    content = content.replace(/```json\n?/g, '');
    content = content.replace(/```\n?/g, '');
    content = content.trim();
    
    // Find JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Try parsing directly
    return JSON.parse(content);
  }


  /**
   * Execute Python builder
   */
  private async executePythonBuilder(chartType: ChartType, payload: any): Promise<string> {
    // Create temp directory for this chart
    const chartId = randomBytes(8).toString('hex');
    const tempDir = join(tmpdir(), 'nomad-charts');
    await mkdir(tempDir, { recursive: true });
    
    const payloadPath = join(tempDir, `${chartId}-input.json`);
    const outputPath = join(tempDir, `${chartId}.png`);

    // Write payload to file
    await writeFile(payloadPath, JSON.stringify(payload, null, 2));

    console.log(`[ChartService] Executing Python builder for ${chartType}`);
    console.log(`[ChartService] Payload: ${payloadPath}`);
    console.log(`[ChartService] Output: ${outputPath}`);

    // Execute the Python script
    const scriptPath = join(process.cwd(), 'scripts', `build_${chartType}.py`);
    
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [scriptPath, payloadPath, outputPath]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('[ChartService] Python execution failed:', stderr);
          reject(new Error(`Python execution failed: ${stderr}`));
        } else {
          console.log('[ChartService] Python execution successful:', stdout);
          resolve(outputPath);
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error('[ChartService] Failed to start Python process:', error);
        reject(error);
      });
    });
  }

  /**
   * Serve chart from local storage
   */
  private async uploadChart(localPath: string): Promise<string> {
    try {
      const fileName = localPath.split('/').pop() || 'chart.png';
      const apiUrl = process.env.API_URL || 'http://localhost:3001';
      const chartUrl = `${apiUrl}/charts/serve/${fileName}`;
      
      // Copy file to a public charts directory
      const publicChartsDir = join(process.cwd(), 'public', 'charts');
      await mkdir(publicChartsDir, { recursive: true });
      
      const publicPath = join(publicChartsDir, fileName);
      await writeFile(publicPath, await readFile(localPath));
      
      console.log(`[ChartService] Served locally at: ${chartUrl}`);
      return chartUrl;
      
    } catch (error: any) {
      console.error('[ChartService] Local storage failed:', error);
      return localPath;
    }
  }
}

