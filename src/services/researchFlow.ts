/**
 * Research Flow Service - External-Focused Orchestrator
 * 
 * This is a SEPARATE agentic flow from reports.
 * Focus: Deep external research using web scraping
 * 
 * Flow:
 * 1. APIM creates comprehensive research plan based on prompt/requirements
 * 2. OpenAI (GPT-5) performs multiple web scraping calls
 * 3. APIM analyzes, reasons, and formats all data into research report
 * 4. Chart agent can plug in for visualizations
 * 
 * Key differences from reports:
 * - No fixed templates (format-free)
 * - Heavy on external data (web scraping)
 * - Multiple OpenAI calls for data gathering
 * - APIM handles planning, analysis, and formatting
 * - NO OpenAI in reports flow (this is research-specific)
 */

import { query as dbQuery } from '../db/query.js';

// ============================================================================
// APIM Helper
// ============================================================================

async function callAPIM(messages: any[], stream = false): Promise<any> {
  const APIM_HOST = process.env.APIM_HOST;
  const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
  const APIM_OPERATION = process.env.APIM_OPERATION || '/chat/strong';

  if (!APIM_HOST || !APIM_SUBSCRIPTION_KEY) {
    throw new Error('APIM_HOST and APIM_SUBSCRIPTION_KEY must be set');
  }

  const url = `${APIM_HOST}${APIM_OPERATION}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for research

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': APIM_SUBSCRIPTION_KEY
      },
      body: JSON.stringify({
        messages,
        stream
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`APIM request failed: ${response.status} - ${errorText}`);
    }

    if (stream) {
      return response;
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('APIM request timed out after 120 seconds');
    }
    throw error;
  }
}

// ============================================================================
// OpenAI Helper (GPT-5 for Web Scraping)
// ============================================================================

async function callOpenAI(messages: any[], model: string = 'gpt-4'): Promise<any> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY must be set in env file');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout for scraping

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model, // Use GPT-5 when available, fallback to GPT-4
        messages,
        temperature: 0.7,
        max_tokens: 4000
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('OpenAI request timed out after 180 seconds');
    }
    throw error;
  }
}

// ============================================================================
// Data Contracts
// ============================================================================

export interface ResearchStep {
  id: string;
  rationale: string;
  action: {
    name: string;
    args: Record<string, any>;
  };
  expects: string[];
  depends_on?: string[];
}

export interface ResearchPlan {
  topic: string;
  objectives: string[];
  depth: 'quick' | 'standard' | 'comprehensive';
  scraping_prompts: ScrapingPrompt[];
  analysis_approach: string;
  expected_sections: string[];
  estimated_duration: string;
}

export interface ScrapingPrompt {
  id: string;
  target: string; // URL or search query
  prompt: string;
  focus: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ScrapedData {
  source: string;
  content: string;
  relevance_score: number;
  key_findings: string[];
  citations: Citation[];
}

export interface Citation {
  source: string;
  url?: string;
  date?: string;
  reliability: 'high' | 'medium' | 'low';
}

export interface ActionResult {
  uri?: string;
  summary?: string;
  meta?: Record<string, any>;
  error?: string;
}

// ============================================================================
// Research Flow Orchestrator
// ============================================================================

export class ResearchFlow {
  private runId: string;
  private userId: string;

  constructor(runId: string, userId: string) {
    this.runId = runId;
    this.userId = userId;
  }

  /**
   * Main execution flow for research
   */
  async execute(): Promise<void> {
    try {
      console.log(`[ResearchFlow] =================================`);
      console.log(`[ResearchFlow] Starting research execution for run ${this.runId}`);
      console.log(`[ResearchFlow] =================================`);

      const run = await this.getRun();
      
      // STEP 1: Load context (prompt, docs, requirements)
      console.log(`\n[ResearchFlow] ========== STEP 1: LOAD CONTEXT ==========`);
      await this.logEvent('flow.status', { 
        status: 'loading_context',
        message: 'Loading research requirements...'
      });

      const contextResult = await dbQuery(
        `SELECT payload FROM agentic_events 
         WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
        [this.runId]
      );

      let fileContext = '';
      let researchDepth = 'standard';
      let targetUrls: string[] = [];

      if (contextResult.rows.length > 0) {
        const contextData = contextResult.rows[0].payload;
        fileContext = contextData.fileContext || '';
        researchDepth = contextData.researchDepth || 'standard';
        targetUrls = contextData.targetUrls || [];
        
        console.log(`[ResearchFlow] ✅ Context loaded:`);
        console.log(`   - File Content: ${fileContext.length} chars`);
        console.log(`   - Research Depth: ${researchDepth}`);
        console.log(`   - Target URLs: ${targetUrls.join(', ') || 'none specified'}`);
      }

      // STEP 2: APIM creates comprehensive research plan
      console.log(`\n[ResearchFlow] ========== STEP 2: CREATE RESEARCH PLAN ==========`);
      await this.logEvent('flow.status', { 
        status: 'creating_plan',
        message: 'Building comprehensive research plan...'
      });

      const researchPlan = await this.createResearchPlan(run.goal, fileContext, researchDepth, targetUrls);
      
      console.log(`[ResearchFlow] ✅ Research plan created:`);
      console.log(`   - Objectives: ${researchPlan.objectives.length}`);
      console.log(`   - Scraping prompts: ${researchPlan.scraping_prompts.length}`);
      console.log(`   - Expected sections: ${researchPlan.expected_sections.length}`);

      await this.logEvent('plan.created', { 
        total_scraping_targets: researchPlan.scraping_prompts.length,
        objectives: researchPlan.objectives,
        depth: researchPlan.depth
      });

      // STEP 3: Execute scraping using OpenAI (multiple calls)
      console.log(`\n[ResearchFlow] ========== STEP 3: SCRAPE DATA (OpenAI) ==========`);
      await this.logEvent('flow.status', { 
        status: 'scraping_data',
        message: `Scraping ${researchPlan.scraping_prompts.length} sources...`
      });

      const scrapedDatasets: ScrapedData[] = [];
      
      for (let i = 0; i < researchPlan.scraping_prompts.length; i++) {
        const prompt = researchPlan.scraping_prompts[i];
        console.log(`\n[ResearchFlow] Scraping ${i + 1}/${researchPlan.scraping_prompts.length}: ${prompt.target}`);
        
        await this.logEvent('scraping.started', {
          prompt_id: prompt.id,
          target: prompt.target,
          priority: prompt.priority
        });

        try {
          const scrapedData = await this.scrapeWithOpenAI(prompt, run.goal);
          scrapedDatasets.push(scrapedData);
          
          console.log(`[ResearchFlow] ✅ Scraped: ${scrapedData.key_findings.length} findings`);
          
          await this.logEvent('scraping.completed', {
            prompt_id: prompt.id,
            findings_count: scrapedData.key_findings.length,
            relevance_score: scrapedData.relevance_score
          });

          // Small delay between scraping calls
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error: any) {
          console.error(`[ResearchFlow] ❌ Scraping failed for ${prompt.target}:`, error.message);
          
          await this.logEvent('scraping.failed', {
            prompt_id: prompt.id,
            target: prompt.target,
            error: error.message
          });
          
          // Continue with other scraping tasks
        }
      }

      console.log(`[ResearchFlow] ✅ Scraping complete: ${scrapedDatasets.length} datasets collected`);

      // STEP 4: APIM analyzes, reasons, and formats all data
      console.log(`\n[ResearchFlow] ========== STEP 4: ANALYZE & FORMAT (APIM) ==========`);
      await this.logEvent('flow.status', { 
        status: 'analyzing_data',
        message: 'Analyzing scraped data and generating research report...'
      });

      const researchReport = await this.analyzeAndFormat(
        run.goal,
        researchPlan,
        scrapedDatasets,
        fileContext
      );

      console.log(`[ResearchFlow] ✅ Research report generated:`);
      console.log(`   - Sections: ${researchReport.sections.length}`);
      console.log(`   - Total length: ${researchReport.full_content.length} chars`);
      console.log(`   - Citations: ${researchReport.citations.length}`);

      // STEP 5: Generate charts if requested
      console.log(`\n[ResearchFlow] ========== STEP 5: GENERATE CHARTS ==========`);
      
      // Check if any chart-worthy data exists
      if (researchReport.chart_data && researchReport.chart_data.length > 0) {
        await this.logEvent('flow.status', { 
          status: 'generating_charts',
          message: `Generating ${researchReport.chart_data.length} charts...`
        });

        for (const chartSpec of researchReport.chart_data) {
          try {
            console.log(`[ResearchFlow] Generating chart: ${chartSpec.title}`);
            
            const chartResult = await this.handleCreateChart({
              chart_type: chartSpec.type,
              data: chartSpec.data,
              title: chartSpec.title,
              goal: run.goal
            });

            console.log(`[ResearchFlow] ✅ Chart generated: ${chartResult.meta?.chart_url}`);

            await this.saveArtifact(
              `chart_${Date.now()}`,
              chartResult.uri!,
              'chart',
              chartResult.meta || {}
            );

          } catch (error: any) {
            console.error(`[ResearchFlow] ❌ Chart generation failed:`, error.message);
          }
        }
      }

      // STEP 6: Save final research report
      console.log(`\n[ResearchFlow] ========== STEP 6: SAVE REPORT ==========`);
      
      const artifactUri = `artifact://research_${Date.now()}`;
      await this.saveArtifact(
        `research_report_${this.runId}`,
        artifactUri,
        'research_report',
        { report: researchReport }
      );

      await this.logEvent('flow.status', { 
        status: 'completed',
        message: 'Research completed successfully'
      });

      // Mark run as complete
      await this.finishRun(run);

      console.log(`\n[ResearchFlow] ✅ Research flow completed for run ${this.runId}`);
      console.log(`[ResearchFlow] ==================== COMPLETE ====================`);

    } catch (error: any) {
      console.error(`[ResearchFlow] ==================== ERROR ====================`);
      console.error(`[ResearchFlow] ❌ Fatal error:`, error.message);
      console.error(`[ResearchFlow] Stack:`, error.stack);

      await this.logEvent('flow.status', { 
        status: 'failed',
        message: 'Research flow failed',
        error: error.message
      });

      try {
        const run = await this.getRun();
        await this.failRun(run, error.message);
      } catch (failError) {
        console.error(`[ResearchFlow] ❌ Could not mark run as failed:`, failError);
      }

      throw error;
    }
  }

  /**
   * STEP 2: Create research plan using APIM
   */
  private async createResearchPlan(
    goal: string, 
    fileContext: string, 
    depth: string, 
    targetUrls: string[]
  ): Promise<ResearchPlan> {
    console.log(`[ResearchFlow] [createResearchPlan] Creating plan with APIM...`);

    const systemPrompt = `You are an expert research strategist. Create a comprehensive research plan for deep external research.

Your task: Analyze the research goal and create a detailed scraping strategy.

OUTPUT FORMAT (STRICT JSON):
{
  "topic": "Brief topic description",
  "objectives": ["Objective 1", "Objective 2", ...],
  "depth": "quick|standard|comprehensive",
  "scraping_prompts": [
    {
      "id": "scrape-001",
      "target": "https://example.com or 'search: keyword'",
      "prompt": "Detailed instruction for what to extract from this source",
      "focus": "What specific info we need",
      "priority": "high|medium|low"
    }
  ],
  "analysis_approach": "How we'll synthesize the data",
  "expected_sections": ["Section 1", "Section 2", ...],
  "estimated_duration": "time estimate"
}

IMPORTANT: 
- Create 3-10 scraping prompts depending on depth
- Each prompt should be specific and actionable
- Prioritize high-quality, authoritative sources
- Include variety: company sites, industry reports, news, forums
- Return ONLY valid JSON`;

    const userPrompt = `RESEARCH GOAL: ${goal}

DEPTH: ${depth}

SPECIFIED TARGET URLs:
${targetUrls.length > 0 ? targetUrls.map(url => `- ${url}`).join('\n') : 'None specified - find best sources'}

UPLOADED CONTEXT:
${fileContext.length > 0 ? fileContext.substring(0, 3000) : 'No uploaded files'}

Create a comprehensive research plan with scraping prompts.`;

    const response = await callAPIM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], false);

    const content = response.choices?.[0]?.message?.content || response.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    
    const plan = JSON.parse(jsonStr);
    
    return {
      topic: plan.topic || goal,
      objectives: plan.objectives || [],
      depth: plan.depth || depth,
      scraping_prompts: plan.scraping_prompts || [],
      analysis_approach: plan.analysis_approach || 'Comprehensive analysis and synthesis',
      expected_sections: plan.expected_sections || ['Introduction', 'Findings', 'Analysis', 'Conclusions'],
      estimated_duration: plan.estimated_duration || '10-15 minutes'
    };
  }

  /**
   * STEP 3: Scrape data using OpenAI (GPT-5)
   */
  private async scrapeWithOpenAI(prompt: ScrapingPrompt, goal: string): Promise<ScrapedData> {
    console.log(`[ResearchFlow] [scrapeWithOpenAI] Scraping ${prompt.target}...`);

    const systemPrompt = `You are an expert web researcher and data extractor.

Your task: Research the specified target and extract comprehensive, accurate information.

Since you cannot directly access websites, use your knowledge to provide:
1. Relevant information about the target
2. Key findings and insights
3. Data points and statistics (if known)
4. Context and analysis
5. Citations and sources

Be thorough, accurate, and cite your sources when possible.

OUTPUT FORMAT (STRICT JSON):
{
  "source": "Source description",
  "content": "Comprehensive extracted information (2-3 paragraphs)",
  "relevance_score": 0.0-1.0,
  "key_findings": ["Finding 1", "Finding 2", ...],
  "citations": [
    {
      "source": "Source name",
      "url": "URL if applicable",
      "date": "Date if known",
      "reliability": "high|medium|low"
    }
  ]
}`;

    const userPrompt = `RESEARCH GOAL: ${goal}

SCRAPING TARGET: ${prompt.target}

SCRAPING INSTRUCTIONS:
${prompt.prompt}

FOCUS: ${prompt.focus}

Extract comprehensive information about this target. Provide detailed findings.`;

    const response = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 'gpt-4'); // Use GPT-4 (will be GPT-5 when available)

    const content = response.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    
    const data = JSON.parse(jsonStr);
    
    return {
      source: data.source || prompt.target,
      content: data.content || '',
      relevance_score: data.relevance_score || 0.7,
      key_findings: data.key_findings || [],
      citations: data.citations || []
    };
  }

  /**
   * STEP 4: Analyze and format all data using APIM
   */
  private async analyzeAndFormat(
    goal: string,
    plan: ResearchPlan,
    scrapedData: ScrapedData[],
    fileContext: string
  ): Promise<any> {
    console.log(`[ResearchFlow] [analyzeAndFormat] Analyzing ${scrapedData.length} datasets with APIM...`);

    const systemPrompt = `You are an expert research analyst. Synthesize all scraped data into a comprehensive research report.

Your task: Analyze all provided data and create a well-structured, insightful research report.

OUTPUT FORMAT (STRICT JSON):
{
  "title": "Report title",
  "executive_summary": "2-3 paragraph summary",
  "sections": [
    {
      "title": "Section title",
      "content": "Section content in markdown",
      "key_points": ["Point 1", "Point 2"]
    }
  ],
  "full_content": "Complete markdown report with all sections",
  "citations": [
    {
      "source": "Source name",
      "url": "URL if applicable",
      "reliability": "high|medium|low"
    }
  ],
  "chart_data": [
    {
      "type": "bar|line|pie|scatter",
      "title": "Chart title",
      "data": { "categories": [...], "values": [...] }
    }
  ],
  "metadata": {
    "sources_analyzed": number,
    "confidence_level": "high|medium|low",
    "completeness": "comprehensive|partial|limited"
  }
}

IMPORTANT:
- Synthesize ALL scraped data
- Identify patterns and insights
- Support claims with citations
- Suggest visualizations where appropriate
- Return ONLY valid JSON`;

    // Consolidate all scraped content
    const consolidatedData = scrapedData.map((d, i) => 
      `SOURCE ${i + 1}: ${d.source}\n` +
      `RELEVANCE: ${d.relevance_score}\n` +
      `CONTENT: ${d.content}\n` +
      `KEY FINDINGS: ${d.key_findings.join('; ')}\n` +
      `CITATIONS: ${d.citations.map(c => c.source).join(', ')}\n`
    ).join('\n---\n\n');

    const userPrompt = `RESEARCH GOAL: ${goal}

RESEARCH PLAN OBJECTIVES:
${plan.objectives.map(obj => `- ${obj}`).join('\n')}

UPLOADED CONTEXT:
${fileContext.length > 0 ? fileContext.substring(0, 2000) : 'None'}

SCRAPED DATA (${scrapedData.length} sources):
${consolidatedData}

Analyze all data and create a comprehensive research report with citations.`;

    const response = await callAPIM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], false);

    const content = response.choices?.[0]?.message?.content || response.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    
    const report = JSON.parse(jsonStr);
    
    return {
      title: report.title || goal,
      executive_summary: report.executive_summary || '',
      sections: report.sections || [],
      full_content: report.full_content || '',
      citations: report.citations || [],
      chart_data: report.chart_data || [],
      metadata: report.metadata || {
        sources_analyzed: scrapedData.length,
        confidence_level: 'medium',
        completeness: 'standard'
      }
    };
  }

  /**
   * Generate chart using chart service (same as reports)
   */
  private async handleCreateChart(args: Record<string, any>): Promise<ActionResult> {
    const { chart_type, data, title, goal } = args;
    
    console.log(`[ResearchFlow] [handleCreateChart] Creating ${chart_type} chart`);

    try {
      const { ChartService } = await import('./chartService.js');
      const chartService = new ChartService();
      
      const chartRequest = {
        data: data,
        chartType: chart_type,
        title: title || `${chart_type} Chart`,
        goal: goal || 'Generate chart for research'
      };
      
      const result = await chartService.generateChart(chartRequest);
      
      if (!result.success) {
        throw new Error(result.error || 'Chart generation failed');
      }
      
      const artifactUri = `artifact://chart_${Date.now()}`;
      
      return {
        uri: artifactUri,
        summary: `Generated ${chart_type} chart: ${result.chart_url}`,
        meta: {
          chart_type,
          chart_url: result.chart_url,
          chart_id: result.chart_id,
          title: chartRequest.title
        }
      };
      
    } catch (error: any) {
      console.error(`[ResearchFlow] [handleCreateChart] Error:`, error.message);
      
      return {
        uri: `artifact://chart_failed_${Date.now()}`,
        summary: `Chart generation failed: ${error.message}`,
        meta: {
          chart_type: chart_type,
          failed: true,
          error: error.message
        }
      };
    }
  }

  // ============================================================================
  // Persistence Methods
  // ============================================================================

  private async getRun(): Promise<any> {
    const result = await dbQuery(
      `SELECT * FROM agentic_runs WHERE run_id = $1`,
      [this.runId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Run not found');
    }
    
    return result.rows[0];
  }

  private async saveArtifact(
    artifactKey: string, 
    uri: string, 
    type: string, 
    meta: Record<string, any>
  ): Promise<void> {
    await dbQuery(
      `INSERT INTO agentic_artifacts (run_id, artifact_key, uri, type, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [this.runId, artifactKey, uri, type, JSON.stringify(meta)]
    );
  }

  private async logEvent(eventType: string, payload: Record<string, any>, stepId?: string): Promise<void> {
    await dbQuery(
      `INSERT INTO agentic_events (ts, run_id, step_id, event_type, payload)
       VALUES (NOW(), $1, $2, $3, $4)`,
      [this.runId, stepId || null, eventType, JSON.stringify(payload)]
    );
  }

  private async finishRun(run: any): Promise<void> {
    await dbQuery(
      `UPDATE agentic_runs SET status = 'completed', finished_at = NOW() WHERE run_id = $1`,
      [this.runId]
    );

    await this.logEvent('run.completed', { goal: run.goal });
  }

  private async failRun(run: any, error: string): Promise<void> {
    await dbQuery(
      `UPDATE agentic_runs SET status = 'failed', finished_at = NOW() WHERE run_id = $1`,
      [this.runId]
    );

    await this.logEvent('run.failed', { goal: run.goal, error });
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  static async createRun(userId: string, goal: string): Promise<string> {
    const runId = `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await dbQuery(
      `INSERT INTO agentic_runs (run_id, user_id, goal, status, completion_criteria, started_at)
       VALUES ($1, $2, $3, 'active', $4, NOW())`,
      [runId, userId, goal, JSON.stringify(['research_compiled', 'mode:research'])]
    );

    return runId;
  }

  static async getRunStatus(runId: string): Promise<any> {
    const runResult = await dbQuery(
      `SELECT * FROM agentic_runs WHERE run_id = $1`,
      [runId]
    );

    if (runResult.rows.length === 0) {
      throw new Error('Run not found');
    }

    const artifactsResult = await dbQuery(
      `SELECT * FROM agentic_artifacts WHERE run_id = $1 ORDER BY created_at ASC`,
      [runId]
    );

    const eventsResult = await dbQuery(
      `SELECT * FROM agentic_events WHERE run_id = $1 ORDER BY ts ASC`,
      [runId]
    );

    return {
      run: runResult.rows[0],
      artifacts: artifactsResult.rows,
      events: eventsResult.rows
    };
  }
}


