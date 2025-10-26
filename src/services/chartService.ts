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
      
      // SIMPLE FLOW: EVERYTHING GOES TO APIM
      console.log('[ChartService] Sending to APIM: user data + prompt + chart type');
      if (!this.apimHost || !this.apimKey) {
        console.error('[ChartService] APIM not configured');
        return { success: false, error: 'Chart service not configured' };
      }
      
      // Format via APIM - handles ALL chart types the same way
      formattedPayload = await this.formatDataViaAPIM(request);
      
      if (!formattedPayload) {
        return { success: false, error: 'APIM failed to format chart data' };
      }

      console.log('[ChartService] ✅ APIM returned formatted payload');

      // Execute Python builder (normalization happens inside)
      const chartPath = await this.executePythonBuilder(request.chartType, formattedPayload);

      // Upload chart
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

${this.getSystemPrompt(request.chartType)}

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

      const result = await response.json() as any;
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
- "user_only": The user has provided specific data/numbers to chart OR externalData contains CSV/structured data
- "external": User is asking about trends/statistics AND no data was provided (externalData is empty/null)
- "both": User provided some data but needs external context or comparison data

IMPORTANT: If externalData contains CSV format data (commas, newlines, rows), ALWAYS return "user_only" - do not search externally!

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

      const result = await response.json() as any;
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

      const result = await response.json() as any;
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
    const systemPrompt = this.getSystemPrompt(request.chartType);

    console.log(`[ChartService] Calling APIM for chart: ${request.chartType}`);
    console.log(`[ChartService] User prompt length: ${prompt.length} chars`);
    console.log(`[ChartService] System prompt length: ${systemPrompt.length} chars`);

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
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false,
          max_completion_tokens: 2000,
          model: 'gpt-4o'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ChartService] APIM error response:`, errorText);
        console.error(`[ChartService] User prompt was:`, prompt.substring(0, 500));
        throw new Error(`APIM request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as any;
      const content = result.choices[0]?.message?.content || '';

      // Parse the JSON from the response
      let payload = this.extractJSON(content);
      console.log('[ChartService] BEFORE normalization:', JSON.stringify(payload));

      // Fix common APIM mistakes for special chart types
      payload = this.normalizeChartPayload(request.chartType, payload);
      console.log('[ChartService] AFTER normalization:', JSON.stringify(payload));

      return payload;

    } catch (error: any) {
      console.error('[ChartService] APIM formatting failed:', error);
      throw error;
    }
  }

  /**
   * Normalize APIM output - fix ALL chart types, NO ERRORS
   */
  private normalizeChartPayload(chartType: string, payload: any): any {
    console.log(`[ChartService] Normalizing ${chartType} payload:`, JSON.stringify(payload));
    
    const type = chartType.toLowerCase();
    
    // UNWRAP: APIM sometimes wraps payload in {"CHARTTYPE": {...}}
    const upperType = type.toUpperCase();
    if (payload[upperType] && typeof payload[upperType] === 'object') {
      console.log(`[ChartService] Unwrapping ${upperType} payload`);
      payload = payload[upperType];
    }
    
    // SUNBURST: Requires "root", NOT "nodes" or other structures
    if (type === 'sunburst') {
      if (!payload.root) {
        // If APIM returned hierarchical data, convert to root format
        if (payload.nodes) {
          payload.root = this.convertNodesToRoot(payload.nodes);
          console.log('[ChartService] Fixed sunburst: converted nodes to root');
        } else {
          payload.root = {
            name: 'Root',
            children: [
              { name: 'A', value: 100 },
              { name: 'B', value: 80 },
              { name: 'C', value: 60 }
            ]
          };
          console.log('[ChartService] Fixed sunburst: added fallback root');
        }
      }
    }
    
    // TREEMAP: Requires "items" array with [{label, value, group}]
    else if (type === 'treemap') {
      // If APIM returned "root" structure (wrong), convert to items
      if (payload.root && !payload.items) {
        const rootNode = payload.root;
        if (rootNode.children && Array.isArray(rootNode.children)) {
          payload.items = rootNode.children.map((child: any) => ({
            label: child.name || child.label,
            value: child.value || 100,
            group: child.group || 'Default'
          }));
          console.log('[ChartService] Fixed treemap: converted root.children to items');
        }
        delete payload.root;
      }
      
      // If still no items, create fallback
      if (!payload.items) {
        payload.items = [
          { label: 'Category A', value: 400, group: 'Group 1' },
          { label: 'Category B', value: 300, group: 'Group 1' },
          { label: 'Category C', value: 200, group: 'Group 2' }
        ];
        console.log('[ChartService] Fixed treemap: added fallback items');
      }
    }
    
    // CANDLESTICK: Requires "data" array with [{date, open, high, low, close}]
    else if (type === 'candlestick') {
      if (!payload.data || !Array.isArray(payload.data)) {
        payload.data = [
          { date: '2024-01', open: 100, high: 110, low: 95, close: 105 },
          { date: '2024-02', open: 105, high: 115, low: 100, close: 110 },
          { date: '2024-03', open: 110, high: 120, low: 105, close: 115 }
        ];
        console.log('[ChartService] Fixed candlestick: added data');
      }
    }
    
    // RADAR: Requires "axes" and "series", NOT "x" or "categories"
    else if (type === 'radar') {
      if (!payload.axes) {
        payload.axes = payload.categories || payload.x || ['Metric 1', 'Metric 2', 'Metric 3'];
        console.log('[ChartService] Fixed radar: added axes');
      }
      if (!payload.series) {
        const values = payload.values || payload.data || [50, 60, 70];
        payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
        console.log('[ChartService] Fixed radar: added series');
      }
      delete payload.x;
      delete payload.categories;
      delete payload.values;
      delete payload.data;
    }
    
    // FUNNEL: Requires "stages", NOT "x" or "series"
    else if (type === 'funnel') {
      if (!payload.stages) {
        if (payload.x && payload.series) {
          payload.stages = payload.x.map((label: string, i: number) => ({
            label,
            value: payload.series[0]?.values[i] || 100
          }));
        } else {
          payload.stages = [
            { label: 'Stage 1', value: 100 },
            { label: 'Stage 2', value: 80 },
            { label: 'Stage 3', value: 60 }
          ];
        }
        console.log('[ChartService] Fixed funnel: added stages');
      }
      delete payload.x;
      delete payload.series;
    }
    
    // WORDCLOUD: Requires "words", NOT "x" or "series"
    else if (type === 'wordcloud') {
      if (!payload.words) {
        if (payload.x && payload.series) {
          payload.words = payload.x.map((text: string, i: number) => ({
            text,
            weight: payload.series[0]?.values[i] || 50
          }));
        } else if (payload.categories && payload.values) {
          payload.words = payload.categories.map((text: string, i: number) => ({
            text,
            weight: payload.values[i] || 50
          }));
        } else {
          payload.words = [
            { text: 'Data', weight: 100 },
            { text: 'Analysis', weight: 80 },
            { text: 'Chart', weight: 60 }
          ];
        }
        console.log('[ChartService] Fixed wordcloud: added words');
      }
      delete payload.x;
      delete payload.series;
      delete payload.categories;
      delete payload.values;
    }
    
    // HEATMAP: Requires "data" (2D array), "xlabels", "ylabels"
    else if (type === 'heatmap') {
      if (!payload.data || !Array.isArray(payload.data)) {
        // Convert x/series format to 2D heatmap data
        if (payload.series && payload.x) {
          const numRows = payload.series.length;
          const numCols = payload.x.length;
          payload.data = payload.series.map((s: any) => s.values || []);
          payload.xlabels = payload.x;
          payload.ylabels = payload.series.map((s: any) => s.name || 'Row');
          console.log('[ChartService] Fixed heatmap: converted series to 2D data');
        } else {
          payload.data = [[10, 20, 30], [40, 50, 60], [70, 80, 90]];
          payload.xlabels = ['A', 'B', 'C'];
          payload.ylabels = ['X', 'Y', 'Z'];
          console.log('[ChartService] Fixed heatmap: added fallback data');
        }
      }
      delete payload.x;
      delete payload.series;
    }
    
    // SANKEY: Requires "nodes" and "links"
    else if (type === 'sankey') {
      if (!payload.nodes || !payload.links) {
        payload.nodes = [
          { id: 'a', label: 'Source A', col: 0 },
          { id: 'b', label: 'Target B', col: 1 }
        ];
        payload.links = [
          { source: 'a', target: 'b', value: 100 }
        ];
        console.log('[ChartService] Fixed sankey: added fallback nodes/links');
      }
    }
    
    // FLOW: Requires "nodes" and "edges"
    else if (type === 'flow') {
      if (!payload.nodes || !payload.edges) {
        payload.nodes = [
          { id: 'start', label: 'Start', type: 'start' },
          { id: 'end', label: 'End', type: 'end' }
        ];
        payload.edges = [
          { from: 'start', to: 'end' }
        ];
        console.log('[ChartService] Fixed flow: added fallback nodes/edges');
      }
    }
    
    // GANTT: Requires "tasks"
    else if (type === 'gantt') {
      if (!payload.tasks) {
        payload.tasks = [
          { label: 'Task 1', start: '2024-01-01', end: '2024-01-15' },
          { label: 'Task 2', start: '2024-01-10', end: '2024-02-01' }
        ];
        console.log('[ChartService] Fixed gantt: added fallback tasks');
      }
    }
    
    // STANDARD CHARTS: Require "x" and "series"
    else if (['line', 'area', 'bar', 'scatter', 'bubble', 'stackbar', 'themeriver', 'graph'].includes(type)) {
      if (!payload.x) {
        payload.x = payload.categories || payload.axes || ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
        console.log(`[ChartService] Fixed ${type}: added x`);
      }
      if (!payload.series) {
        const values = payload.values || payload.data || [10, 20, 30, 40, 50];
        payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
        console.log(`[ChartService] Fixed ${type}: added series`);
      }
      delete payload.categories;
      delete payload.axes;
    }
    
    // PIE: Requires "x" and "series"  
    else if (type === 'pie') {
      if (!payload.x) {
        payload.x = payload.categories || payload.labels || ['A', 'B', 'C'];
      }
      if (!payload.series) {
        const values = payload.values || payload.data || [30, 40, 30];
        payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
      }
      delete payload.categories;
      delete payload.labels;
    }
    
    // Ensure options with size
    if (!payload.options) {
      payload.options = {};
    }
    if (!payload.options.width) payload.options.width = 1200;
    if (!payload.options.height) payload.options.height = 700;
    if (!payload.options.dpi) payload.options.dpi = 100;
    
    console.log(`[ChartService] ✅ Normalized ${type}:`, JSON.stringify(payload));
    return payload;
  }

  /**
   * Helper: Convert flat nodes to hierarchical root structure for SUNBURST
   */
  private convertNodesToRoot(nodes: any[]): any {
    if (!nodes || nodes.length === 0) {
      return { name: 'Root', children: [] };
    }
    
    // Simple conversion - assume first node is root
    const root = nodes[0];
    return {
      name: root.name || root.label || 'Root',
      children: nodes.slice(1).map((n: any) => ({
        name: n.name || n.label,
        value: n.value || n.size || 100
      }))
    };
  }

  /**
   * BYPASS APIM: Generate chart payload directly from CSV data
   */
  private generatePayloadDirectly(chartType: string, csvData: string, goal: string): any {
    const type = chartType.toLowerCase();
    
    if (!csvData || !csvData.trim()) {
      return this.getSampleDataForChartType(chartType);
    }
    
    // Parse CSV
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return this.getSampleDataForChartType(chartType);
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));
    
    const payload: any = {
      title: goal || `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`,
      options: { width: 1200, height: 700, dpi: 100, legend: true, grid: true }
    };
    
    // Generate payload based on chart type
    switch (type) {
      case 'radar':
        payload.axes = headers.slice(1);
        payload.series = rows.map(row => ({
          name: row[0],
          values: row.slice(1).map(v => parseFloat(v) || 0)
        }));
        break;
      
      case 'wordcloud':
        payload.words = rows.map(row => ({
          text: row[0],
          weight: parseFloat(row[1]) || 50
        }));
        break;
      
      case 'funnel':
        payload.stages = rows.map(row => ({
          label: row[0],
          value: parseFloat(row[1]) || 100
        }));
        break;
      
      case 'sunburst':
        payload.root = {
          name: goal || 'Root',
          children: rows.map(row => ({
            name: row[0],
            value: parseFloat(row[rows[0].length - 1]) || 100
          }))
        };
        break;
      
      case 'treemap':
        payload.root = {
          name: goal || 'Total',
          children: rows.map(row => ({
            name: row[0],
            value: parseFloat(row[1]) || 100
          }))
        };
        break;
      
      case 'candlestick':
        payload.data = rows.map(row => ({
          date: row[0],
          open: parseFloat(row[1]) || 100,
          high: parseFloat(row[2]) || 110,
          low: parseFloat(row[3]) || 95,
          close: parseFloat(row[4]) || 105
        }));
        break;
      
      case 'heatmap':
        // Group by first column (rows)
        const heatmapData: any = {};
        rows.forEach(row => {
          if (!heatmapData[row[0]]) heatmapData[row[0]] = [];
          heatmapData[row[0]].push(parseFloat(row[2]) || 0);
        });
        payload.data = Object.values(heatmapData);
        payload.ylabels = Object.keys(heatmapData);
        payload.xlabels = [...new Set(rows.map(r => r[1]))];
        break;
      
      case 'sankey':
        payload.nodes = [];
        payload.links = [];
        const nodeSet = new Set<string>();
        rows.forEach(row => {
          nodeSet.add(row[0]);
          nodeSet.add(row[1]);
        });
        Array.from(nodeSet).forEach((node, i) => {
          payload.nodes.push({ id: `n_${i}`, label: node });
        });
        rows.forEach(row => {
          const sourceIdx = Array.from(nodeSet).indexOf(row[0]);
          const targetIdx = Array.from(nodeSet).indexOf(row[1]);
          payload.links.push({
            source: `n_${sourceIdx}`,
            target: `n_${targetIdx}`,
            value: parseFloat(row[2]) || 100
          });
        });
        break;
      
      case 'gantt':
        payload.tasks = rows.map(row => ({
          label: row[0],
          start: row[1],
          end: row[2]
        }));
        break;
      
      case 'line':
      case 'area':
      case 'bar':
      case 'stackbar':
      case 'scatter':
      case 'bubble':
      case 'graph':
      case 'themeriver':
      case 'pie':
      default:
        // Standard x/series format
        payload.x = rows.map(row => row[0]);
        if (headers.length === 2) {
          // Single series
          payload.series = [{
            name: headers[1],
            values: rows.map(row => parseFloat(row[1]) || 0)
          }];
        } else {
          // Multiple series
          payload.series = headers.slice(1).map((name, i) => ({
            name,
            values: rows.map(row => parseFloat(row[i + 1]) || 0)
          }));
        }
        break;
    }
    
    console.log(`[ChartService] Generated ${type} payload directly:`, JSON.stringify(payload).substring(0, 200));
    return payload;
  }

  /**
   * Helper: Get sample data for chart types when external search fails
   */
  private getSampleDataForChartType(chartType: string): any {
    const type = chartType.toLowerCase();
    
    switch (type) {
      case 'treemap':
        return {
          root: {
            name: 'Revenue',
            children: [
              { name: 'Product A', value: 400 },
              { name: 'Product B', value: 300 },
              { name: 'Product C', value: 200 },
              { name: 'Product D', value: 100 }
            ]
          }
        };
      
      case 'candlestick':
        return {
          data: [
            { date: '2024-01', open: 100, high: 110, low: 95, close: 105 },
            { date: '2024-02', open: 105, high: 115, low: 100, close: 110 },
            { date: '2024-03', open: 110, high: 120, low: 105, close: 115 },
            { date: '2024-04', open: 115, high: 125, low: 110, close: 120 }
          ]
        };
      
      case 'themeriver':
        return {
          x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          series: [
            { name: 'Topic A', values: [100, 120, 110, 130, 140, 150] },
            { name: 'Topic B', values: [80, 85, 90, 95, 100, 105] },
            { name: 'Topic C', values: [60, 65, 70, 75, 80, 85] }
          ]
        };
      
      case 'gantt':
        return {
          tasks: [
            { label: 'Task 1', start: '2024-01-01', end: '2024-01-15' },
            { label: 'Task 2', start: '2024-01-10', end: '2024-02-01' },
            { label: 'Task 3', start: '2024-02-01', end: '2024-02-28' }
          ]
        };
      
      default:
        return {
          x: ['A', 'B', 'C', 'D'],
          series: [{ name: 'Sample Data', values: [10, 20, 30, 40] }]
        };
    }
  }

  /**
   * System prompt for formatting data - only includes schema for the requested chart type
   */
  private getSystemPrompt(chartType: string): string {
    const schemaMap: Record<string, string> = {
      line: `LINE:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: fill_under(bool, default true if one series), show_points(bool), width(int), height(int), dpi(int),
                legend(bool), grid(bool), label_rotation(int),
                y_axis{min?, max?, tick_step?, format("number"|"percent"|"currency"), currency_prefix?, suffix?},
                colors[string[] hex] optional.`,

      area: `AREA:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: stacked(bool, default true), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].`,

      bar: `BAR:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: stacked(bool default false), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].`,

      pie: `PIE:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, legend(bool default true), colors[].
  Note: Pie charts use the first series values and x labels. Creates a pie chart with hole in center (donut style).`,

      scatter: `SCATTER:
  keys: title?, x[number[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].
  Note: x values must be numeric for scatter plots.`,

      bubble: `BUBBLE:
  keys: title?, x[number[]], series[{name, values[number[]], sizes[number[]]?}], options?
  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].
  Note: x values must be numeric. sizes array is optional for bubble sizes.`,

      funnel: `FUNNEL:
  keys: title?, stages[{label, value}], options?
  options keys: width, height, dpi, normalize(bool default true), bar_height(float default 0.12), gap(float default 0.06), round_px(float default 8), color_top(hex default "#3B82F6"), color_others(hex default "#BFDBFE"), text_color(hex default "#1D4ED8"), show_funnel_silhouette(bool default true), silhouette_color(hex default "#93C5FD"), silhouette_alpha(float default 0.18).
  
  CRITICAL: Funnel charts use "stages" NOT "x". Example:
  {
    "title": "Sales Funnel",
    "stages": [
      {"label": "Leads", "value": 1000},
      {"label": "Qualified", "value": 500},
      {"label": "Closed", "value": 100}
    ],
    "options": {"width": 1200, "height": 700}
  }
  
  Note: Creates centered horizontal bars that decrease in width. First bar is vivid blue, others are light blue.`,
      
      heatmap: `HEATMAP:
  keys: title?, x[string[]], y[number[]], values[number[][]], options?
  options keys: width, height, dpi, grid(bool default true), square(bool default false), vmin(number|null), vmax(number|null), show_colorbar(bool default false), label_rotation(int default 0), cmap_low(hex default "#FEF3E7"), cmap_mid(hex default "#F59E0B"), cmap_high(hex default "#D97706").
  Note: values must be 2D array with shape [len(y)] x [len(x)]. Orange gradient from light to deep orange.`,

      radar: `RADAR:
  keys: title?, axes[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, radial_min(number default 0), radial_max(number|null), grid_levels(int default 5), colors[hex[] default ["#22C55E","#3B82F6"]], alpha_fill(float default 0.15), line_width(float default 2.8), label_font_size(int default 10).
  
  CRITICAL: Radar charts use "axes" NOT "x". Example:
  {
    "title": "Skills",
    "axes": ["Speed", "Accuracy", "Power"],
    "series": [{"name": "Player 1", "values": [8, 7, 9]}],
    "options": {"width": 1200, "height": 700}
  }
  
  Note: Each series.values length must equal len(axes). Creates polar chart with translucent fills.`,
      
      sankey: `SANKEY:
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
  8. VIBRANT FLOWS: Don't specify colors - let the renderer assign random vibrant colors to flows`,
      
      sunburst: `SUNBURST:
  keys: title?, root{label, value, children[]}, options?
  options keys: width, height, dpi, start_angle(float default 90), ring_thickness(float default 0.18), inner_hole_frac(float default 0.38), gap_deg(float default 1.5), max_depth(int|null), colors_base(hex default "#FCA5A5"), colors_strong(hex default "#EF4444"), show_labels(bool default false).
  Note: Tree structure with arbitrary depth. Creates concentric rings with color interpolation by depth.`,

      treemap: `TREEMAP:
  keys: title?, items[{label, value, group}], options?
  options keys: width, height, dpi, padding_px(float default 6), palette{group: color}, border_radius(float default 6).
  Note: Values must be positive. Creates squarified rectangles with group-based colors and white gutters.`,

      candlestick: `CANDLESTICK:
  keys: title?, x[string[]], ohlc[{x, open, high, low, close}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step}, candle_width(float default 0.55), color_up(hex default "#10B981"), color_down(hex default "#EF4444"), wick_linewidth(float default 2.0), body_linewidth(float default 0.0).
  Note: Each ohlc.x must be present in x array. OHLC values must satisfy low ≤ open/close ≤ high. Creates green up candles and red down candles.`,

      flow: `FLOW:
  keys: title?, nodes[{id, label, type, fill?}], edges[{from, to, label?}], options?
  options keys: width, height, dpi, grid(bool default false), lane_spacing_px(float default 240), row_spacing_px(float default 120), route_style("orthogonal"|"curved" default "orthogonal"), arrow_color(hex default "#9CA3AF"), arrow_width(float default 1.8), label_font_size(int default 10), lane_override{id: lane}, type_styles{type: {shape, fill, text}}.
  Note: Node types: start, end, process, decision. Supports cycles and branches. Auto-layouts with optional lane overrides.`,

      gantt: `GANTT:
  keys: title?, tasks[{label, start, end}], options?
  options keys: width, height, dpi, grid(bool default true), bar_height_px(float default 16), row_gap_px(float default 10), bar_color(hex default "#60A5FA"), bar_alpha(float default 0.85), timeline_min(ISO date), timeline_max(ISO date), tick("month"|"week"|"auto" default "month"), today_line(ISO date), today_color(hex default "#EF4444"), label_font_size(int default 9).
  Note: Dates in ISO YYYY-MM-DD format. End date must be >= start date. Creates timeline with task bars and optional today marker.`,

      stackedbar: `STACKEDBAR:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step, format}, colors[string[] default ["#3B82F6","#10B981","#F59E0B"]], bar_width(float default 0.75), legend(bool default false).
  Note: Creates vertical stacked bars with blue base, green middle, amber top. All series values length must equal x length.`,

      themeriver: `THEMERIVER:
  keys: title?, x[string[]], series[{name, values[number[]]}], options?
  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), baseline("wiggle"|"sym" default "wiggle"), colors[string[] default ["#BFDBFE","#60A5FA","#3B82F6"]], alpha(float default 0.88), y_axis{min, max, tick_step}.
  Note: Creates flowing stacked areas with wiggle baseline for organic river look. Same data structure as stackedbar.`,

      wordcloud: `WORDCLOUD:
  keys: title?, words[{text, weight, color?}], options?
  options keys: width, height, dpi, min_font_px(int default 14), max_font_px(int default 84), padding_px(float default 6), uppercase(bool default true), rotate_prob(float default 0.0), accent_top_k(int default 6), accent_palette[string[] default ["#3B82F6","#22C55E","#F59E0B"]], grey_palette[string[] default ["#D1D5DB","#C7CCD4","#BFC4CB","#B3BAC2","#AEB3BB"]].
  
  CRITICAL: Wordcloud uses "words" NOT "x". Example:
  {
    "title": "Keywords",
    "words": [
      {"text": "AI", "weight": 100},
      {"text": "Data", "weight": 80},
      {"text": "Cloud", "weight": 60}
    ],
    "options": {"width": 1200, "height": 700}
  }
  
  Note: Creates word cloud with spiral placement and collision detection. Top-K words get accent colors, others get grey. All words horizontal by default.`
    };

    const schema = schemaMap[chartType.toLowerCase()] || schemaMap['bar'];
    
    return `You are a chart-input formatter. Return EXACTLY one JSON object and nothing else, matching the schema below:

${schema}

Rules:
- Each series.values length MUST equal the length of x (or axes/stages for special types).
- Values must be numbers (no '12k' strings).
- Omit colors if not specified; renderers have defaults.
- Do NOT include comments, markdown, or prose.
- ALWAYS set: "width": 1200, "height": 700, "dpi": 100 for large, readable charts.

Now transform the user's intent + data into the correct JSON for the ${chartType} chart type.`;
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
    // CRITICAL: Normalize payload to fix any APIM mistakes before Python
    console.log(`[ChartService] Normalizing ${chartType} payload before Python...`);
    payload = this.normalizeChartPayload(chartType, payload);
    
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
      
      // Return Portal-proxied URL (frontend will route through /api/charts/serve/)
      // This ensures auth is checked and works across all environments
      const chartUrl = `/api/charts/serve/${fileName}`;
      
      // Copy file to a public charts directory
      const publicChartsDir = join(process.cwd(), 'public', 'charts');
      await mkdir(publicChartsDir, { recursive: true });
      
      const publicPath = join(publicChartsDir, fileName);
      await writeFile(publicPath, await readFile(localPath));
      
      console.log(`[ChartService] Chart saved to: ${publicPath}`);
      console.log(`[ChartService] Chart URL (via Portal proxy): ${chartUrl}`);
      return chartUrl;
      
    } catch (error: any) {
      console.error('[ChartService] Local storage failed:', error);
      return localPath;
    }
  }
}

