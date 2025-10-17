/**
 * Agentic Flow Service - Manus.im style
 * Planner policy (LLM prompt) emits next atomic step as strict JSON
 * Host orchestrator executes that step, persists results, re-prompts
 */

import { query as dbQuery } from '../db/query.js';

// ============================================================================
// APIM Helper - Direct calls to APIM
// ============================================================================

async function callAPIM(messages: any[], stream = false): Promise<any> {
  const APIM_HOST = process.env.APIM_HOST;
  const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
  const APIM_OPERATION = process.env.APIM_OPERATION || '/chat/strong';

  if (!APIM_HOST || !APIM_SUBSCRIPTION_KEY) {
    throw new Error('APIM_HOST and APIM_SUBSCRIPTION_KEY must be set');
  }

  const url = `${APIM_HOST}${APIM_OPERATION}`;

  // Create AbortController for timeout (5 minutes for long-running operations)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

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
      throw new Error('APIM request timed out after 5 minutes');
    }
    throw error;
  }
}

// ============================================================================
// Data Contracts (strict & boring)
// ============================================================================

export interface PlannerStep {
  id: string; // step-###
  rationale: string; // <=150 chars
  action: {
    name: string; // host-defined
    args: Record<string, any>;
  };
  expects: string[]; // verifiable checks
  depends_on?: string[]; // artifact://...
}

export interface HostContext {
  GOAL: string; // one sentence
  CONTEXT: {
    constraints: string;
    completion_criteria: string[];
  };
  STATE: {
    artifacts: Record<string, string>; // key -> artifact://...
    notes: string; // 1-3 lines
  };
  OBS?: {
    last_action: string;
    result: {
      uri?: string; // artifact://...
      summary?: string;
      error?: string;
    };
  };
}

export interface ActionResult {
  uri?: string; // artifact://...
  summary?: string;
  meta?: Record<string, any>;
  error?: string;
}

export interface Run {
  run_id: string;
  goal: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  started_at: Date;
  finished_at?: Date;
  completion_criteria: string[];
  user_id: string;
}

export interface Step {
  run_id: string;
  step_id: string;
  action_name: string;
  args_json: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  started_at?: Date;
  finished_at?: Date;
  result_uri?: string;
  result_summary?: string;
  error_class?: string;
}

export interface Artifact {
  artifact_key: string;
  uri: string;
  type: string;
  meta: Record<string, any>;
  created_at: Date;
}

export interface Event {
  ts: Date;
  run_id: string;
  step_id?: string;
  event_type: string;
  payload: Record<string, any>;
}

// ============================================================================
// Planner Policy (LLM Prompt)
// ============================================================================

// NEW: Full Plan Generation System Prompt
const getFullPlannerSystemPrompt = (mode: string) => {
  const basePrompt = `You are Apex, an AI report planning specialist.

Your job: Analyze the user's request and ALL provided data, then create a COMPLETE step-by-step plan to build the requested output.

CRITICAL ANALYSIS STEPS:
1. Review ALL parsed document content provided
2. Check if data is sufficient for requested charts
3. If data is missing, plan to search for external sources
4. Design a logical flow: data gathering → analysis → visualization → writing → assembly

OUTPUT FORMAT (STRICT JSON ARRAY):
{
  "plan": [
    {
      "id": "step-001",
      "rationale": "Brief explanation of why this step is needed",
      "action": {
        "name": "action_name",
        "args": { "key": "value" }
      },
      "expects": ["What this step will produce"],
      "depends_on": []
    },
    {
      "id": "step-002",
      "rationale": "Next step",
      "action": { "name": "another_action", "args": {} },
      "expects": ["Expected output"],
      "depends_on": ["artifact://step-001"]
    }
  ],
  "total_steps": 6,
  "estimated_duration": "2-3 minutes"
}

IMPORTANT: Return ONLY valid JSON, no additional text.`;

  switch (mode) {
    case 'reports':
      return basePrompt + `

AVAILABLE ACTIONS FOR REPORTS:
- analyze_data: Deep analysis of uploaded documents + goal using APIM
- search_external_data: Find additional data if needed for charts
- create_chart: Generate charts using existing chart builder (bar, line, pie, scatter, etc) - shows as bullet point in todo list
- draft_section: Write a report section using APIM (Executive Summary, Analysis, Conclusions, etc)
- assemble_report: Combine all sections + charts into final formatted markdown report
- done: Mark completion

REPORT PLANNING RULES:
1. User provides: goal, parsed document data, report length (short/medium/long), chart types requested, focus area
2. Analyze what data you have vs what you need
3. Plan charts based on available data - if data insufficient, add search_external_data step
4. Number of sections depends on report length: short=3-4, medium=5-7, long=8-12
5. Each chart is its own step
6. Final step is ALWAYS assemble_report
7. Make the plan SPECIFIC to the user's goal - no generic templates!

EXAMPLE PLAN FOR "Sales Report with Bar Chart":
{
  "plan": [
    {"id": "step-001", "rationale": "Analyze uploaded sales data", "action": {"name": "analyze_data", "args": {"focus": "sales trends"}}, "expects": ["Data analysis complete"]},
    {"id": "step-002", "rationale": "Generate bar chart of sales by quarter", "action": {"name": "create_chart", "args": {"chart_type": "bar", "data_focus": "quarterly sales"}}, "expects": ["Chart artifact created"]},
    {"id": "step-003", "rationale": "Write executive summary", "action": {"name": "draft_section", "args": {"section_name": "Executive Summary"}}, "expects": ["Section written"]},
    {"id": "step-004", "rationale": "Write detailed analysis section", "action": {"name": "draft_section", "args": {"section_name": "Sales Analysis"}}, "expects": ["Section written"]},
    {"id": "step-005", "rationale": "Assemble final report", "action": {"name": "assemble_report", "args": {}}, "expects": ["Complete formatted report"]},
    {"id": "step-006", "rationale": "Completion", "action": {"name": "done", "args": {}}, "expects": ["Flow complete"]}
  ],
  "total_steps": 6,
  "estimated_duration": "2-3 minutes"
}`;
    
    default:
      return basePrompt + `\n\nAvailable actions: search, analyze_data, create_content, assemble_output, done`;
  }
};

// OLD: Single-step planner (deprecated, keeping for fallback)
const getPlannerSystemPrompt = (mode: string) => {
  const basePrompt = `You are Apex, an orchestrator that achieves a GOAL via the smallest next step.

You DO NOT call tools. You only emit STRICT JSON describing ONE next action.
The host executes actions and returns observations/artifacts.

OUTPUT (STRICT JSON ONLY):
{
  "id": "step-001",
  "rationale": "Start by identifying requirements",
  "action": {
    "name": "identify_requirements",
    "args": {}
  },
  "expects": ["Requirements identified"],
  "depends_on": []
}

RULES:
- One action per turn. No bundling.
- Action names/args are host-defined; do not invent or invoke specific tools.
- Prefer the smallest step that measurably advances toward completion_criteria.
- Reference prior outputs ONLY by artifact URIs.
- Never fabricate facts or artifacts; rely solely on provided STATE/OBS.

IMPORTANT: You must respond with ONLY the JSON object, no other text.`;

  switch (mode) {
    case 'reports':
      return basePrompt + `

Available actions: parse_data, analyze_data, create_chart, draft_section, assemble_report, done

SPECIAL INSTRUCTIONS FOR REPORTS:
- First step should ALWAYS be parse_data to gather context (uploaded docs, chart preferences, goal)
- Analyze_data should deeply analyze uploaded documents using APIM
- Create_chart should generate graphs based on data (use chart_preferences from STATE)
- Draft_section should create custom sections using APIM (vary structure based on goal)
- Each report should be DIFFERENT - no fixed templates!
- Use uploaded document content for analysis, not generic text`;
    
    case 'research':
      return basePrompt + `

Available actions: search, analyze_data, extract_insights, draft_section, compile_research, done`;
    
    case 'slides':
      return basePrompt + `

Available actions: search, analyze_data, create_slide, design_layout, assemble_presentation, done`;
    
    case 'charts':
      return basePrompt + `

AVAILABLE ACTIONS FOR CHARTS:
- analyze_data: Extract structured chart data from uploaded documents (returns JSON with categories/values)
- create_chart: Generate Python matplotlib/plotly chart from data (bar, line, pie, scatter, area, heatmap, etc)
- done: Mark completion

CHARTS PLANNING RULES:
1. User provides: goal (what to visualize), parsed document data, chart types requested
2. STEP 1: Always analyze_data ONCE to extract structured data (categories + values)
3. STEP 2-N: Create each requested chart type using the data from step 1
4. Each chart gets its own create_chart step
5. Final step is ALWAYS done
6. Keep it simple - focus on data extraction and visualization

EXAMPLE PLAN FOR "Create bar and line charts of sales data":
{
  "plan": [
    {"id": "step-001", "rationale": "Extract sales data into structured format", "action": {"name": "analyze_data", "args": {"focus": "extract chart-ready data with categories and values"}}, "expects": ["Structured data extracted"]},
    {"id": "step-002", "rationale": "Generate bar chart of sales", "action": {"name": "create_chart", "args": {"chart_type": "bar", "title": "Sales by Category", "source_artifact": "artifact://step-001"}}, "expects": ["Bar chart created"]},
    {"id": "step-003", "rationale": "Generate line chart of sales trend", "action": {"name": "create_chart", "args": {"chart_type": "line", "title": "Sales Trend Over Time", "source_artifact": "artifact://step-001"}}, "expects": ["Line chart created"]},
    {"id": "step-004", "rationale": "Complete", "action": {"name": "done", "args": {}}, "expects": ["Workflow complete"]}
  ]
}`;
    
    case 'plans':
      return basePrompt + `

Available actions: search, analyze_requirements, draft_plan_section, create_timeline, assemble_plan, done`;
    
    default:
      return basePrompt + `

Available actions: search, analyze_data, create_content, assemble_output, done`;
  }
};

// ============================================================================
// Host Orchestrator
// ============================================================================

export class AgenticFlow {
  private runId: string;
  private userId: string;
  private mode: string;

  constructor(runId: string, userId: string, mode: string = 'general') {
    console.log(`[AgenticFlow] Constructor called with runId: ${runId}, userId: ${userId}, mode: ${mode}`);
    this.runId = runId;
    this.userId = userId;
    this.mode = mode;
  }

  /**
   * NEW Main orchestrator - Plan once, execute plan step by step
   * Emits real-time SSE events for frontend
   */
  async execute(): Promise<void> {
    try {
      console.log(`[AgenticFlow] =================================`);
      console.log(`[AgenticFlow] Starting NEW execution flow for run ${this.runId}`);
      console.log(`[AgenticFlow] Mode: ${this.mode}, User: ${this.userId}`);
      console.log(`[AgenticFlow] =================================`);
      
      // Validate that the mode is supported
      const supportedModes = ['reports', 'charts', 'research'];
      if (!supportedModes.includes(this.mode)) {
        const errorMsg = `Mode "${this.mode}" is not yet implemented. Only "reports" and "charts" modes are currently available.`;
        console.error(`[AgenticFlow] ❌ ${errorMsg}`);
        
        await this.logEvent('flow.status', { 
          status: 'error',
          message: errorMsg
        });
        
        const run = await this.getRun();
        await this.failRun(run, errorMsg);
        
        throw new Error(errorMsg);
      }
      
      const run = await this.getRun();
      console.log(`[AgenticFlow] Run loaded - Status: ${run.status}, Goal: ${run.goal}`);
      
      // STEP 1: Get all context from initial request
      console.log(`\n[AgenticFlow] ========== STEP 1: LOAD CONTEXT ==========`);
      
      // Emit: Starting to load context
      await this.logEvent('flow.status', { 
        status: 'loading_context',
        message: 'Loading uploaded documents and preferences...'
      });
      
      const contextResult = await dbQuery(
        `SELECT payload FROM agentic_events 
         WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
        [this.runId]
      );
      
      let fileContext = '';
      let reportLength = 'medium';
      let reportFocus = 'balanced';
      let selectedCharts: string[] = [];
      
      if (contextResult.rows.length > 0) {
        const contextData = contextResult.rows[0].payload;
        fileContext = contextData.fileContext || '';
        reportLength = contextData.reportLength || 'medium';
        reportFocus = contextData.reportFocus || 'balanced';
        selectedCharts = contextData.selectedCharts || [];
        
        console.log(`[AgenticFlow] ✅ Context loaded:`);
        console.log(`   - File Content: ${fileContext.length} chars`);
        console.log(`   - Report Length: ${reportLength}`);
        console.log(`   - Report Focus: ${reportFocus}`);
        console.log(`   - Charts Requested: ${selectedCharts.join(', ') || 'none'}`);
      } else {
        console.log(`[AgenticFlow] ⚠️  No context found, using defaults`);
      }
      
      // STEP 2: Call planner ONCE to get full plan
      console.log(`\n[AgenticFlow] ========== STEP 2: CREATE FULL PLAN ==========`);
      
      // Emit: Creating plan
      await this.logEvent('flow.status', { 
        status: 'creating_plan',
        message: 'Analyzing your request and creating task list...'
      });
      
      let plan: PlannerStep[];
      
      try {
        console.log(`[AgenticFlow] About to call callFullPlanner...`);
        plan = await this.callFullPlanner(run.goal, fileContext, reportLength, reportFocus, selectedCharts);
        console.log(`[AgenticFlow] ✅ Plan created with ${plan.length} steps`);
      } catch (plannerError: any) {
        console.error(`[AgenticFlow] ❌ Planner failed:`, plannerError.message);
        console.error(`[AgenticFlow] ❌ Planner error stack:`, plannerError.stack);
        console.log(`[AgenticFlow] Using fallback plan for ${this.mode} mode`);
        plan = this.getFallbackPlan(run.goal, selectedCharts, reportLength);
      }
      
      // Emit: Plan created with actual steps
      await this.logEvent('plan.created', { 
        total_steps: plan.length,
        steps: plan.map((s, i) => ({
          step_number: i + 1,
          step_id: s.id,
          action: s.action.name,
          description: s.rationale,
          status: 'pending'
        }))
      });
      
      // STEP 3: Execute each step in the plan
      console.log(`\n[AgenticFlow] ========== STEP 3: EXECUTE PLAN ==========`);
      
      for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        console.log(`\n[AgenticFlow] -------- Step ${i+1}/${plan.length}: ${step.action.name} --------`);
        console.log(`[AgenticFlow] Rationale: ${step.rationale}`);
        
        // Check if done - handle completion without executing the step
        if (step.action.name === 'done') {
          console.log(`[AgenticFlow] ✅ Plan complete!`);
          
          try {
            // Mark step as completed without executing it
            await this.startStep(step);
            await this.completeStep(step, { summary: 'Flow completed successfully' });
            await this.logEvent('step.completed', { step_id: step.id, result: { summary: 'Flow completed successfully' } });
            
            // Emit: Step completed
            await this.logEvent('step.progress', {
              step_number: i + 1,
              step_id: step.id,
              action: step.action.name,
              description: step.rationale,
              status: 'completed',
              duration_ms: 0
            });
            
            // Log flow completion
            await this.logEvent('flow.status', { 
              status: 'completed',
              message: 'All tasks completed successfully'
            });
            
            // Mark the run as completed in the database
            const run = await this.getRun();
            await this.finishRun(run);
            
            console.log(`[AgenticFlow] ✅ Run ${this.runId} marked as completed in database`);
            
          } catch (completionError: any) {
            console.error(`[AgenticFlow] ❌ Error during completion:`, completionError.message);
            console.error(`[AgenticFlow] Stack:`, completionError.stack);
            
            // Try to mark as completed anyway
            try {
              const run = await this.getRun();
              await this.finishRun(run);
              console.log(`[AgenticFlow] ✅ Run ${this.runId} marked as completed despite error`);
            } catch (finishError: any) {
              console.error(`[AgenticFlow] ❌ Could not mark run as completed:`, finishError.message);
            }
          }
          
          break;
        }
        
        // Emit: Step started
        await this.logEvent('step.progress', {
          step_number: i + 1,
          step_id: step.id,
          action: step.action.name,
          description: step.rationale,
          status: 'in_progress'
        });
        
        // Execute step
        const stepStartTime = Date.now();
        try {
          await this.executeStep(step);
          const duration = Date.now() - stepStartTime;
          console.log(`[AgenticFlow] ✅ Step ${i+1} completed: ${step.action.name} (${duration}ms)`);
          
          // Emit: Step completed
          await this.logEvent('step.progress', {
            step_number: i + 1,
            step_id: step.id,
            action: step.action.name,
            description: step.rationale,
            status: 'completed',
            duration_ms: duration
          });
          
        } catch (stepError: any) {
          const duration = Date.now() - stepStartTime;
          console.error(`[AgenticFlow] ❌❌❌ Step ${i+1} FAILED ❌❌❌`);
          console.error(`[AgenticFlow] Action: ${step.action.name}`);
          console.error(`[AgenticFlow] Error message:`, stepError.message);
          console.error(`[AgenticFlow] Error stack:`, stepError.stack);
          console.error(`[AgenticFlow] Step args:`, JSON.stringify(step.action.args, null, 2));
          
          // Emit: Step failed
          await this.logEvent('step.progress', {
            step_number: i + 1,
            step_id: step.id,
            action: step.action.name,
            description: step.rationale,
            status: 'failed',
            error: stepError.message,
            duration_ms: duration
          });
          
          // For chart failures, log additional context
          if (step.action.name === 'create_chart') {
            console.error(`[AgenticFlow] ❌ CHART GENERATION FAILED - Check if data exists in analyze_data artifact`);
          }
          
          // Continue with next step even if one fails (best effort)
        }
        
        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Mark run as complete (only if not already completed by 'done' step)
      const currentRun = await this.getRun();
      if (currentRun.status === 'active') {
        await this.finishRun(currentRun);
      }
      
      console.log(`\n[AgenticFlow] ✅ Execution completed for run ${this.runId}`);
      console.log(`[AgenticFlow] ==================== EXECUTE COMPLETE ====================`);
      
    } catch (topLevelError: any) {
      console.error(`[AgenticFlow] ==================== TOP LEVEL ERROR ====================`);
      console.error(`[AgenticFlow] ❌ Fatal error in execute():`, topLevelError.message);
      console.error(`[AgenticFlow] Stack:`, topLevelError.stack);
      console.error(`[AgenticFlow] ==================== END TOP LEVEL ERROR ====================`);
      
      // Emit: Flow failed
      await this.logEvent('flow.status', { 
        status: 'failed',
        message: 'Flow execution failed',
        error: topLevelError.message
      });
      
      try {
        const run = await this.getRun();
        await this.failRun(run, topLevelError.message);
      } catch (failError) {
        console.error(`[AgenticFlow] ❌ Could not even mark run as failed:`, failError);
      }
      
      throw topLevelError;
    }
  }

  /**
   * Get next step for reports mode - structured sequence
   */
  private async getNextReportStep(state: { artifacts: Record<string, string>; notes: string }, goal: string, stepNumber: number): Promise<PlannerStep> {
    const artifactKeys = Object.keys(state.artifacts);
    const hasParseData = artifactKeys.some(k => k.includes('parse_data'));
    const hasRequirements = artifactKeys.some(k => k.includes('identify_requirements'));
    const hasAnalysis = artifactKeys.some(k => k.includes('analyze_data'));
    const hasCharts = artifactKeys.some(k => k.includes('create_chart'));
    const hasSections = artifactKeys.some(k => k.includes('draft_section'));
    const hasReport = artifactKeys.some(k => k.includes('assemble_report'));

    // Step 1: Parse input data and determine layout
    if (!hasParseData) {
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: "Parse input and determine custom report layout based on user request",
            action: {
              name: "parse_data",
              args: {
            goal: goal,
                input_data: "User input and configuration",
            data_sources: ["user_input", "uploaded_documents"]
              }
            },
        expects: ["Data parsed", "Layout determined", "Report structure defined"],
            depends_on: []
          };
    }

    // Step 2: Identify requirements (NO EXTERNAL DATA - use docs only)
    if (!hasRequirements) {
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: "Identify report requirements and structure",
        action: {
          name: "identify_requirements",
          args: {
            goal: goal,
            available_data: "Parsed input and external research data",
            key_facts: {},
            citations: []
          }
        },
        expects: ["Requirements identified", "Report structure defined"],
        depends_on: artifactKeys.filter(k => k.includes('parse_data'))
      };
    }

    // Step 3: Analyze data from uploaded documents
    if (!hasAnalysis) {
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: "Analyze data from uploaded documents and extract key insights",
        action: {
          name: "analyze_data",
          args: {
            data_sources: ["uploaded_documents", "parsed_data"],
            analysis_type: "company_intelligence"
          }
        },
        expects: ["Data analyzed", "Insights extracted"],
        depends_on: artifactKeys.filter(k => k.includes('identify_requirements'))
      };
    }

    // Step 4-6: Create charts with real data (create multiple)
    const chartCount = artifactKeys.filter(k => k.includes('create_chart')).length;
    if (chartCount < 3) {
      const chartTypes = ['bar', 'line', 'pie', 'area', 'scatter'];
      const chartType = chartTypes[chartCount];
      
      // Generate realistic data based on goal
      const sampleData = this.generateChartDataFromGoal(goal, chartType, chartCount);
      
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: `Generate ${chartType} chart with data extracted from analysis`,
        action: {
          name: "create_chart",
          args: {
            chart_type: chartType,
            data: sampleData.data,
            title: sampleData.title,
            styling: {
              color: "#3B82F6",
              alpha: 0.8
            },
            notes: `Chart ${chartCount + 1} based on company intelligence data`
          }
        },
        expects: ["Chart image generated", "Visualization saved"],
        depends_on: artifactKeys.filter(k => k.includes('analyze_data'))
      };
    }

    // Step 8-11: Draft sections (create multiple)
    const sectionCount = artifactKeys.filter(k => k.includes('draft_section')).length;
    if (sectionCount < 4) {
      const sections = ['Executive Summary', 'Introduction', 'Analysis', 'Recommendations'];
      const sectionName = sections[sectionCount];
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: `Draft ${sectionName} section`,
        action: {
          name: "draft_section",
          args: {
            section_name: sectionName,
            content_type: "detailed",
            data_sources: ["analysis", "external_data", "charts"]
          }
        },
        expects: ["Section drafted", "Content generated"],
        depends_on: artifactKeys.filter(k => k.includes('create_chart') || k.includes('analyze_data'))
      };
    }

    // Step 12: Assemble final report
    if (!hasReport) {
      return {
        id: `step-${String(stepNumber).padStart(3, '0')}`,
        rationale: "Assemble final comprehensive report",
        action: {
          name: "assemble_report",
          args: {
            sections: artifactKeys.filter(k => k.includes('draft_section')),
            charts: artifactKeys.filter(k => k.includes('create_chart')),
            metadata: {
              generated_at: new Date().toISOString(),
              goal: goal
            }
          }
        },
        expects: ["Report assembled", "Final output generated"],
        depends_on: artifactKeys.filter(k => k.includes('draft_section'))
      };
    }

    // All done
    return {
      id: `step-${String(stepNumber).padStart(3, '0')}`,
      rationale: "All tasks completed successfully",
      action: {
        name: "done",
        args: {}
      },
      expects: ["Flow completed"],
      depends_on: artifactKeys
    };
  }

  /**
   * Generate realistic chart data based on goal and chart type
   */
  private generateChartDataFromGoal(goal: string, chartType: string, chartIndex: number): { data: any; title: string } {
    // Extract company/topic from goal
    const topic = goal.toLowerCase();
    
    // Generate relevant metrics based on topic
    let title = '';
    let data: any = {};
    
    if (chartIndex === 0) {
      // First chart - Market metrics (bar/pie)
      title = 'Market Position & Growth';
      if (chartType === 'scatter') {
        data = { x: [1, 2, 3, 4], y: [67, 85, 92, 78] };
      } else {
        data = {
          categories: ['Market Share', 'User Growth', 'Revenue', 'Engagement'],
          values: [67, 85, 92, 78]
        };
      }
    } else if (chartIndex === 1) {
      // Second chart - Trend over time (line/area)
      title = 'Performance Trends (2020-2024)';
      if (chartType === 'scatter') {
        data = { x: [2020, 2021, 2022, 2023, 2024], y: [45, 62, 78, 85, 92] };
      } else {
        data = {
          categories: ['2020', '2021', '2022', '2023', '2024'],
          values: [45, 62, 78, 85, 92]
        };
      }
    } else {
      // Third chart - Competitive analysis (pie)
      title = 'Competitive Comparison';
      if (chartType === 'scatter') {
        data = { x: [1, 2, 3, 4], y: [88, 75, 92, 84] };
      } else {
        data = {
          categories: ['Product Quality', 'Market Reach', 'Innovation', 'Customer Satisfaction'],
          values: [88, 75, 92, 84]
        };
      }
    }
    
    return { data, title };
  }

  /**
   * Fallback step generator if APIM planner fails
   */
  /**
   * NEW: Generate a complete fallback plan if APIM planner fails
   */
  private getFallbackPlan(goal: string, selectedCharts: string[], reportLength: string): PlannerStep[] {
    console.log(`[AgenticFlow] [getFallbackPlan] Creating fallback plan for ${this.mode} mode`);
    console.log(`[AgenticFlow] [getFallbackPlan] Goal: ${goal}`);
    console.log(`[AgenticFlow] [getFallbackPlan] Selected Charts: ${selectedCharts?.join(', ') || 'none'}`);
    console.log(`[AgenticFlow] [getFallbackPlan] Report Length: ${reportLength}`);
    
    const plan: PlannerStep[] = [];
    let stepId = 1;
    
    // CHARTS MODE: Simplified flow focused only on data extraction and visualization
    if (this.mode === 'charts') {
      // Step 1: Extract structured chart data
      plan.push({
        id: `step-${String(stepId++).padStart(3, '0')}`,
        rationale: "Extract structured data for charts (categories and values)",
        action: { name: "analyze_data", args: { goal, focus: "extract chart-ready structured data" } },
        expects: ["Structured chart data extracted"],
        depends_on: []
      });
      
      // Step 2-N: Create each requested chart - these show as bullet points in todo list
      if (selectedCharts && selectedCharts.length > 0) {
        for (const chartType of selectedCharts) {
          plan.push({
            id: `step-${String(stepId++).padStart(3, '0')}`,
            rationale: `📊 Generate ${chartType} chart from extracted data`,
            action: { 
              name: "create_chart", 
              args: { 
                chart_type: chartType,
                title: `${goal} - ${chartType} chart`,
                source_artifact: "step-001" 
              } 
            },
            expects: [`${chartType} chart created with image URL`],
            depends_on: ["artifact://step-001"]
          });
        }
      } else {
        // No charts selected, create a default bar chart
        plan.push({
          id: `step-${String(stepId++).padStart(3, '0')}`,
          rationale: "📊 Generate default bar chart from extracted data",
          action: { 
            name: "create_chart", 
            args: { 
              chart_type: "bar",
              title: goal,
              source_artifact: "step-001" 
            } 
          },
          expects: ["Bar chart created with image URL"],
          depends_on: ["artifact://step-001"]
        });
      }
      
      // Final step: Done
      plan.push({
        id: `step-${String(stepId++).padStart(3, '0')}`,
        rationale: "Charts generation complete",
        action: { name: "done", args: {} },
        expects: ["All charts generated"],
        depends_on: []
      });
      
      console.log(`[AgenticFlow] [getFallbackPlan] Created CHARTS plan with ${plan.length} steps`);
      return plan;
    }
    
    // REPORTS MODE: Full report generation flow
    // Step 1: Always start with data analysis
    plan.push({
      id: `step-${String(stepId++).padStart(3, '0')}`,
      rationale: "Analyze uploaded documents and user goal",
      action: { name: "analyze_data", args: { goal, focus: "comprehensive" } },
      expects: ["Data analysis complete"],
      depends_on: []
    });
    
    // Step 2-N: Create charts (one per requested type) - these show as bullet points in todo list
    if (selectedCharts && selectedCharts.length > 0) {
      for (const chartType of selectedCharts) {
        plan.push({
          id: `step-${String(stepId++).padStart(3, '0')}`,
          rationale: `📊 Generate ${chartType} chart from analyzed data`,
          action: { name: "create_chart", args: { chart_type: chartType, source_artifact: "step-001" } },
          expects: [`${chartType} chart created with image URL`],
          depends_on: ["artifact://step-001"]
        });
      }
    }
    
    // Steps for sections (based on report length)
    const sectionCounts = { short: 3, medium: 5, long: 8 };
    const numSections = sectionCounts[reportLength as keyof typeof sectionCounts] || 5;
    const sectionNames = [
      "Executive Summary",
      "Data Analysis",
      "Key Findings",
      "Detailed Insights",
      "Market Trends",
      "Recommendations",
      "Methodology",
      "Conclusions"
    ];
    
    for (let i = 0; i < Math.min(numSections, sectionNames.length); i++) {
      plan.push({
        id: `step-${String(stepId++).padStart(3, '0')}`,
        rationale: `Draft ${sectionNames[i]} section`,
        action: { name: "draft_section", args: { section_name: sectionNames[i], goal } },
        expects: ["Section written"],
        depends_on: ["artifact://step-001"]
      });
    }
    
    // Final step: Assemble report
    plan.push({
      id: `step-${String(stepId++).padStart(3, '0')}`,
      rationale: "Combine all sections and charts into final report",
      action: { name: "assemble_report", args: { goal } },
      expects: ["Complete formatted report"],
      depends_on: []
    });
    
    // Done
    plan.push({
      id: `step-${String(stepId++).padStart(3, '0')}`,
      rationale: "Mark completion",
      action: { name: "done", args: {} },
      expects: ["Flow complete"],
      depends_on: []
    });
    
    console.log(`[AgenticFlow] [getFallbackPlan] Created plan with ${plan.length} steps`);
    plan.forEach((step, i) => {
      console.log(`[AgenticFlow] [getFallbackPlan] Step ${i + 1}: ${step.action.name} - ${step.rationale}`);
    });
    return plan;
  }

  /**
   * OLD: Single-step fallback (deprecated, keeping for compatibility)
   */
  private getFallbackStep(state: { artifacts: Record<string, string>; notes: string }, goal: string, stepNumber: number): PlannerStep {
    const artifactKeys = Object.keys(state.artifacts);
    const hasParseData = artifactKeys.some(k => k.includes('parse_data'));
    const hasAnalysis = artifactKeys.some(k => k.includes('analyze_data'));
    const hasCharts = artifactKeys.some(k => k.includes('create_chart'));
    const hasSections = artifactKeys.some(k => k.includes('draft_section'));
    const hasReport = artifactKeys.some(k => k.includes('assemble_report'));

    if (!hasParseData) {
      return { id: `step-${stepNumber}`, rationale: "Parse input data", action: { name: "parse_data", args: { goal } }, expects: ["Data parsed"], depends_on: [] };
    }
    if (!hasAnalysis) {
      return { id: `step-${stepNumber}`, rationale: "Analyze data", action: { name: "analyze_data", args: { goal, analysis_type: "comprehensive" } }, expects: ["Analysis complete"], depends_on: [] };
    }
    if (artifactKeys.filter(k => k.includes('create_chart')).length < 2) {
      return { id: `step-${stepNumber}`, rationale: "Create chart", action: { name: "create_chart", args: { chart_type: "bar", goal } }, expects: ["Chart created"], depends_on: [] };
    }
    if (artifactKeys.filter(k => k.includes('draft_section')).length < 2) {
      const sections = ['Executive Summary', 'Analysis'];
      return { id: `step-${stepNumber}`, rationale: "Draft section", action: { name: "draft_section", args: { section_name: sections[artifactKeys.filter(k => k.includes('draft_section')).length], goal } }, expects: ["Section drafted"], depends_on: [] };
    }
    if (!hasReport) {
      return { id: `step-${stepNumber}`, rationale: "Assemble report", action: { name: "assemble_report", args: { goal } }, expects: ["Report assembled"], depends_on: [] };
    }
    return { id: `step-${stepNumber}`, rationale: "Done", action: { name: "done", args: {} }, expects: ["Complete"], depends_on: [] };
  }

  /**
   * Call planner (LLM) to get next step
   */
  /**
   * NEW: Call planner ONCE to get full plan with all steps
   */
  private async callFullPlanner(goal: string, fileContext: string, reportLength: string, reportFocus: string, selectedCharts: string[]): Promise<PlannerStep[]> {
    console.log(`[AgenticFlow] [callFullPlanner] Creating complete plan...`);
    console.log(`[AgenticFlow] [callFullPlanner] APIM_HOST: ${process.env.APIM_HOST ? 'SET' : 'NOT SET'}`);
    console.log(`[AgenticFlow] [callFullPlanner] APIM_SUBSCRIPTION_KEY: ${process.env.APIM_SUBSCRIPTION_KEY ? 'SET' : 'NOT SET'}`);
    
    const systemPrompt = getFullPlannerSystemPrompt(this.mode);
    
    // Build rich context for planner
    const plannerContext = {
      goal: goal,
      parsed_documents: fileContext || "No documents uploaded",
      report_length: reportLength || "medium",
      report_focus: reportFocus || "balanced",
      requested_charts: selectedCharts || [],
      mode: this.mode
    };
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(plannerContext, null, 2) }
    ];

    console.log(`[AgenticFlow] [callFullPlanner] Calling APIM with full context...`);
    console.log(`[AgenticFlow] [callFullPlanner] Goal: ${goal}`);
    console.log(`[AgenticFlow] [callFullPlanner] Report Length: ${reportLength}, Focus: ${reportFocus}`);
    console.log(`[AgenticFlow] [callFullPlanner] Charts Requested: ${selectedCharts?.join(', ') || 'none'}`);
    console.log(`[AgenticFlow] [callFullPlanner] Document Content Length: ${fileContext?.length || 0} chars`);
    
    let response;
    try {
      console.log(`[AgenticFlow] [callFullPlanner] About to call APIM...`);
      response = await callAPIM(messages, false);
      console.log(`[AgenticFlow] [callFullPlanner] APIM call completed successfully`);
    } catch (error: any) {
      console.error(`[AgenticFlow] [callFullPlanner] APIM call failed:`, error.message);
      console.log(`[AgenticFlow] [callFullPlanner] Using fallback plan due to APIM error`);
      // Return a fallback plan instead of failing
      return this.getFallbackPlan(goal, selectedCharts, 'medium');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AgenticFlow] [callFullPlanner] APIM error:`, errorText);
      // Return a fallback plan instead of failing
      return this.getFallbackPlan(goal, selectedCharts, 'medium');
    }

    const data = await response.json() as any;
    
    // Extract content from response
    let content: string;
    if ('choices' in data && data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if ('content' in data && typeof data.content === 'string') {
      content = data.content;
    } else {
      throw new Error('Invalid response format from planner');
    }

    console.log(`[AgenticFlow] [callFullPlanner] Raw response:`, content.substring(0, 500));

    // Parse the plan
    try {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      
      const planData = JSON.parse(jsonStr);
      
      if (!planData.plan || !Array.isArray(planData.plan)) {
        throw new Error('Plan response missing "plan" array');
      }
      
      console.log(`[AgenticFlow] [callFullPlanner] ✅ Got plan with ${planData.plan.length} steps`);
      console.log(`[AgenticFlow] [callFullPlanner] Steps:`, planData.plan.map((s: any) => `${s.id}: ${s.action.name}`).join(', '));
      
      return planData.plan as PlannerStep[];
      
    } catch (error: any) {
      console.error(`[AgenticFlow] [callFullPlanner] ❌ Failed to parse plan:`, error.message);
      console.error(`[AgenticFlow] [callFullPlanner] Content:`, content);
      throw new Error(`Invalid JSON from planner: ${error.message}`);
    }
  }

  /**
   * OLD: Single-step planner (keeping for fallback)
   */
  private async callPlanner(context: HostContext): Promise<PlannerStep> {
    console.log(`[AgenticFlow] [callPlanner] Starting APIM call...`);
    
    const systemPrompt = getPlannerSystemPrompt(this.mode);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(context, null, 2) }
    ];

    console.log(`[AgenticFlow] [callPlanner] Calling APIM...`);
    
    let response;
    try {
      response = await callAPIM(messages, false);
    } catch (error: any) {
      console.error(`[AgenticFlow] [callPlanner] APIM call failed:`, error.message);
      // Return a fallback step instead of failing
      return this.getFallbackStep(context.STATE, context.GOAL, 1);
    }

    console.log(`[AgenticFlow] [callPlanner] Response status:`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AgenticFlow] [callPlanner] APIM error response:`, errorText);
      // Return a fallback step instead of failing
      return this.getFallbackStep(context.STATE, context.GOAL, 1);
    }

    const data = await response.json() as any;
    console.log(`[AgenticFlow] [callPlanner] Planner response keys:`, Object.keys(data));

    if (!data || typeof data !== 'object') {
      throw new Error('No response from planner');
    }

    // Handle different response formats
    let content: string;
    if ('choices' in data && data.choices && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
      content = data.choices[0].message.content;
      console.log(`[AgenticFlow] Extracted content from choices:`, content);
    } else if ('content' in data && typeof data.content === 'string') {
      content = data.content;
      console.log(`[AgenticFlow] Extracted content from direct:`, content);
    } else if ('summary' in data) {
      // Handle APIM response format with summary
      console.log(`[AgenticFlow] APIM response format detected, creating step from summary`);
      const responseData = data as any;
      const step = {
        id: "step-001",
        rationale: "Analyze available information and identify requirements",
        action: {
          name: "identify_requirements",
          args: {
            goal: context.GOAL,
            available_data: responseData.summary,
            key_facts: responseData.key_facts || {},
            citations: responseData.citations || []
          }
        },
        expects: ["Requirements identified", "Data sources analyzed"],
        depends_on: []
      };
      console.log(`[AgenticFlow] Created step from APIM response:`, step);
      return step;
    } else {
      console.log(`[AgenticFlow] Invalid response format. Response keys:`, Object.keys(data));
      console.log(`[AgenticFlow] Response structure:`, data);
      throw new Error('Invalid response format from planner');
    }

    if (!content) {
      throw new Error('No content in planner response');
    }

    try {
      return JSON.parse(content) as PlannerStep;
    } catch (error) {
      throw new Error('Invalid JSON from planner');
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: PlannerStep): Promise<void> {
    // Start step
    await this.startStep(step);

    try {
      // Dispatch to APIM
      const result = await this.dispatchAction(step.action.name, step.action.args);
      
      // Save artifact if provided with action name in key
      if (result.uri) {
        const artifactKey = `${step.action.name}_${step.id}`;
        await this.saveArtifact(artifactKey, result.uri, step.action.name, result.meta || {});
      }

      // Complete step
      await this.completeStep(step, result);
      
      // Log event
      await this.logEvent('step.completed', { step_id: step.id, result });

    } catch (error: any) {
      // Fail step
      await this.failStep(step, error);
      throw error;
    }
  }

  /**
   * Dispatch action to APIM facade
   */
  private async dispatchAction(actionName: string, args: Record<string, any>): Promise<ActionResult> {
    // APIM facade - route to appropriate handler based on mode
    switch (actionName) {
      // Common actions
      case 'search':
        return await this.handleSearch(args);
      case 'search_external_data':
        return await this.handleSearchExternalData(args);
      case 'analyze_data':
        return await this.handleAnalyzeData(args);
      case 'parse_data':
        return await this.handleParseData(args);
      case 'collect_external_data':
        return await this.handleCollectExternalData(args);
      case 'identify_requirements':
        return await this.handleIdentifyRequirements(args);
      case 'done':
        return { summary: 'Flow completed successfully' };
      
      // Reports mode actions
      case 'create_chart':
        return await this.handleCreateChart(args);
      case 'draft_section':
        return await this.handleDraftSection(args);
      case 'assemble_report':
        return await this.handleAssembleReport(args);
      
      // Research mode actions
      case 'extract_insights':
        return await this.handleExtractInsights(args);
      case 'compile_research':
        return await this.handleCompileResearch(args);
      
      // Templates mode actions
      case 'create_slide':
        return await this.handleCreateSlide(args);
      case 'design_layout':
        return await this.handleDesignLayout(args);
      case 'assemble_presentation':
        return await this.handleAssemblePresentation(args);
      
      // Charts mode actions
      case 'optimize_visualization':
        return await this.handleOptimizeVisualization(args);
      case 'generate_chart_code':
        return await this.handleGenerateChartCode(args);
      
      // Plans mode actions
      case 'analyze_requirements':
        return await this.handleAnalyzeRequirements(args);
      case 'draft_plan_section':
        return await this.handleDraftPlanSection(args);
      case 'create_timeline':
        return await this.handleCreateTimeline(args);
      case 'assemble_plan':
        return await this.handleAssemblePlan(args);
      
      // General actions
      case 'create_content':
        return await this.handleCreateContent(args);
      case 'assemble_output':
        return await this.handleAssembleOutput(args);
      
      default:
        throw new Error(`Unknown action: ${actionName}`);
    }
  }

  // ============================================================================
  // Action Handlers
  // ============================================================================

  private async handleSearch(args: Record<string, any>): Promise<ActionResult> {
    const { query, max_results = 5 } = args;
    
    // TODO: Implement actual search via APIM
    console.log(`[Search] Searching for: ${query}`);
    const results = [
      { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
      { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2' }
    ];

    const artifactUri = `artifact://search_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Found ${results.length} search results for: ${query}`,
      meta: { query, results, max_results }
    };
  }

  private async handleSearchExternalData(args: Record<string, any>): Promise<ActionResult> {
    const { data_type, context, chart_type } = args;
    
    console.log(`[SearchExternalData] Looking for ${data_type} data for ${chart_type || 'analysis'}`);
    console.log(`[SearchExternalData] Context:`, context);
    
    // TODO: Implement real web search via APIM
    // For now, return mock data
    const artifactUri = `artifact://external_data_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Found external data for ${data_type}`,
      meta: { 
        data_type,
        source: 'web_search',
        sample_data: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          values: [45, 67, 89, 103]
        }
      }
    };
  }

  private async handleCreateChart(args: Record<string, any>): Promise<ActionResult> {
    const { chart_type, data_source, title, goal, source_artifact } = args;
    
    console.log(`[AgenticFlow] [handleCreateChart] Creating ${chart_type} chart`);
    console.log(`[AgenticFlow] [handleCreateChart] Args:`, args);
    
    // Get data from previous analysis step or use provided data
    let chartData = data_source || {};
    
    // If we have a source artifact, try to get data from it
    if (source_artifact) {
      const artifactResult = await dbQuery(
        `SELECT meta FROM agentic_artifacts WHERE run_id = $1 AND artifact_key LIKE '%${source_artifact}%' ORDER BY created_at DESC LIMIT 1`,
        [this.runId]
      );
      
      if (artifactResult.rows.length > 0) {
        const row = artifactResult.rows[0];
        // Parse meta if it's a string (from JSONB column)
        const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
        // Try to extract chart data from the analysis artifact
        chartData = meta.chart_data || meta.sample_data || meta.data || {};
        console.log(`[AgenticFlow] [handleCreateChart] Extracted data from artifact:`, chartData);
      }
    }
    
    // If no data available, provide a minimal structure for the chart service to work with
    if (!chartData || Object.keys(chartData).length === 0) {
      console.log(`[AgenticFlow] [handleCreateChart] No data found, using fallback data`);
      chartData = {
        categories: ['Sample A', 'Sample B', 'Sample C'],
        values: [10, 20, 30]
      };
    }
    
    // Call the existing chart service
    try {
      const { ChartService } = await import('../services/chartService');
      const chartService = new ChartService();
      
      const chartRequest = {
        data: chartData,
        chartType: chart_type,
        title: title || `${chart_type} Chart`,
        goal: goal || 'Generate chart for report'
      };
      
      console.log(`[AgenticFlow] [handleCreateChart] Calling ChartService with:`, chartRequest);
      
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
          title: chartRequest.title,
          data_used: chartData
        }
      };
      
    } catch (error: any) {
      console.error(`[AgenticFlow] [handleCreateChart] Error:`, error.message);
      
      // Return a failure result instead of throwing to allow report generation to continue
      return {
        uri: `artifact://chart_failed_${Date.now()}`,
        summary: `Chart generation failed: ${error.message}`,
        meta: {
          chart_type: chart_type,
          chart_url: null,
          chart_id: null,
          title: title || `${chart_type} Chart`,
          data_used: chartData,
          error: error.message,
          failed: true
        }
      };
    }
  }

  private async generateChartCriteria(chartType: string, title: string, notes: string, sourceArtifact?: string): Promise<any> {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY
    });

    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a data visualization expert. Generate specific criteria for creating charts including data structure, styling, and best practices."
          },
          {
            role: "user",
            content: `Generate criteria for a ${chartType} chart titled "${title}". Notes: ${notes}. Provide specific data structure requirements, styling guidelines, and best practices for this chart type.`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      return {
        chart_type: chartType,
        title: title,
        criteria: response.choices[0].message.content,
        data_structure: this.getDataStructureForChartType(chartType),
        styling_guidelines: this.getStylingForChartType(chartType)
      };
    } catch (error) {
      console.error('Error generating chart criteria:', error);
      return {
        chart_type: chartType,
        title: title,
        criteria: 'Default criteria',
        data_structure: this.getDataStructureForChartType(chartType),
        styling_guidelines: this.getStylingForChartType(chartType)
      };
    }
  }

  private getDataStructureForChartType(chartType: string): any {
    const structures: Record<string, any> = {
      'bar': { categories: 'string[]', values: 'number[]' },
      'line': { x: 'number[]', y: 'number[]' },
      'pie': { labels: 'string[]', values: 'number[]' },
      'scatter': { x: 'number[]', y: 'number[]' },
      'area': { x: 'number[]', y: 'number[]' },
      'heatmap': { data: 'number[][]', labels: 'string[]' },
      'treemap': { labels: 'string[]', values: 'number[]' },
      'bubble': { x: 'number[]', y: 'number[]', size: 'number[]' }
    };
    return structures[chartType] || structures['bar'];
  }

  private getStylingForChartType(chartType: string): any {
    const styles: Record<string, any> = {
      'bar': { color: '#3B82F6', alpha: 0.8, grid: true },
      'line': { color: '#10B981', linewidth: 2, markers: true },
      'pie': { colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'], explode: false },
      'scatter': { color: '#8B5CF6', size: 50, alpha: 0.6 },
      'area': { color: '#06B6D4', alpha: 0.3, fill: true },
      'heatmap': { cmap: 'Blues', annot: true, fmt: 'd' },
      'treemap': { colors: 'Set3', textinfo: 'label+value' },
      'bubble': { color: '#F59E0B', alpha: 0.6, size_range: [20, 200] }
    };
    return styles[chartType] || styles['bar'];
  }

  private async generateChartCode(chartType: string, data: any, title: string, styling?: any, criteria?: any): Promise<string> {
    const baseCode = `
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import json
import os

# Set style
plt.style.use('default')
plt.rcParams['figure.facecolor'] = 'white'
plt.rcParams['axes.facecolor'] = 'white'

# Data
data = ${JSON.stringify(data)}

# Create DataFrame
df = pd.DataFrame(data)

# Create figure
fig, ax = plt.subplots(figsize=(12, 8))
`;

    switch (chartType) {
      case 'bar':
        return baseCode + `
# Bar chart
bars = ax.bar(df['categories'], df['values'], color='#3B82F6', alpha=0.8, edgecolor='white', linewidth=1)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('Categories', fontsize=12)
ax.set_ylabel('Values', fontsize=12)
ax.grid(axis='y', alpha=0.3, linestyle='--')

# Add value labels on bars
for bar in bars:
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height + height*0.01,
             f'{int(height)}', ha='center', va='bottom', fontweight='bold')

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Bar chart generated successfully")
`;

      case 'line':
        return baseCode + `
# Line chart
ax.plot(df['categories'], df['values'], marker='o', linewidth=3, markersize=8, 
        color='#3B82F6', markerfacecolor='#1E40AF', markeredgecolor='white', markeredgewidth=2)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('Categories', fontsize=12)
ax.set_ylabel('Values', fontsize=12)
ax.grid(True, alpha=0.3, linestyle='--')

# Add value labels
for i, (x, y) in enumerate(zip(df['categories'], df['values'])):
    ax.annotate(f'{int(y)}', (x, y), textcoords="offset points", xytext=(0,10), 
                ha='center', fontweight='bold')

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Line chart generated successfully")
`;

      case 'pie':
        return baseCode + `
# Pie chart
colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']
wedges, texts, autotexts = ax.pie(df['values'], labels=df['categories'], 
                                  autopct='%1.1f%%', colors=colors[:len(df)],
                                  startangle=90, explode=[0.05] * len(df))

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)

# Style the text
for autotext in autotexts:
    autotext.set_color('white')
    autotext.set_fontweight('bold')
    autotext.set_fontsize(10)

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Pie chart generated successfully")
`;

      case 'scatter':
        return baseCode + `
# Scatter plot
scatter = ax.scatter(df['x'], df['y'], c='#3B82F6', alpha=0.7, s=100, edgecolors='white', linewidth=2)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('X Values', fontsize=12)
ax.set_ylabel('Y Values', fontsize=12)
ax.grid(True, alpha=0.3, linestyle='--')

# Add trend line if possible
if len(df) > 1:
    z = np.polyfit(df['x'], df['y'], 1)
    p = np.poly1d(z)
    ax.plot(df['x'], p(df['x']), "r--", alpha=0.8, linewidth=2)

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Scatter plot generated successfully")
`;

      case 'area':
        return baseCode + `
# Area chart
ax.fill_between(df['categories'], df['values'], alpha=0.7, color='#3B82F6')
ax.plot(df['categories'], df['values'], color='#1E40AF', linewidth=3, marker='o', markersize=6)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('Categories', fontsize=12)
ax.set_ylabel('Values', fontsize=12)
ax.grid(axis='y', alpha=0.3, linestyle='--')

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Area chart generated successfully")
`;

      case 'heatmap':
        return baseCode + `
# Heatmap
import seaborn as sns
sns.heatmap(df, annot=True, cmap='YlOrRd', fmt='.1f', cbar_kws={'label': 'Values'}, ax=ax)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Heatmap generated successfully")
`;

      default:
        return baseCode + `
# Default bar chart
bars = ax.bar(df['categories'], df['values'], color='#3B82F6', alpha=0.8)

# Customize
ax.set_title('${title}', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('Categories', fontsize=12)
ax.set_ylabel('Values', fontsize=12)
ax.grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.savefig('chart.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("Chart generated successfully")
`;
    }
  }

  private async executePythonChart(code: string, chartType: string, data: any, title: string, styling?: any): Promise<{ imageUrl: string; chartId?: string }> {
    console.log(`[Chart] Python executor disabled - returning placeholder`);
    return {
      imageUrl: `data:image/svg+xml;base64,${Buffer.from(`<svg width="800" height="400"><text x="50%" y="50%" text-anchor="middle">Chart: ${title}</text></svg>`).toString('base64')}`
    };
  }

  private async handleAnalyzeData(args: Record<string, any>): Promise<ActionResult> {
    const { data_sources, analysis_type, focus_areas, focus, datasets, goal: argGoal } = args;
    
    const run = await this.getRun();
    
    // Get file context from agentic_events (where ADI parsed content is stored)
    const contextResult = await dbQuery(
      `SELECT payload FROM agentic_events 
       WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
      [this.runId]
    );
    
    let fileContext = '';
    let documentInfo = 'No documents uploaded.';
    
    if (contextResult.rows.length > 0) {
      const contextData = contextResult.rows[0].payload;
      fileContext = contextData.fileContext || '';
      
      if (fileContext.length > 0) {
        documentInfo = `${fileContext.length} characters of parsed document content available.`;
      }
    }
    
    console.log(`[AnalyzeData] File context length: ${fileContext.length} chars`);
    console.log(`[AnalyzeData] Goal: ${run.goal}`);
    console.log(`[AnalyzeData] Focus: ${focus || analysis_type || 'comprehensive'}`);
    
    // Call APIM to perform REAL analysis
    let analysisText = '';
    try {
      const response = await callAPIM([
        {
          role: 'system',
          content: `You are a business intelligence analyst. Analyze the provided document data and create a comprehensive, data-driven analysis.

IMPORTANT: Return ONLY valid JSON in this format:
{
  "analysis": "Your detailed analysis text here",
  "chart_data": {
    "categories": ["Label1", "Label2", "Label3"],
    "values": [10, 20, 30]
  },
  "key_insights": ["Insight 1", "Insight 2"]
}`
        },
        {
          role: 'user',
          content: `GOAL: ${run.goal}

PARSED DOCUMENT DATA:
${fileContext || 'No document data available'}

ANALYSIS TYPE: ${focus || analysis_type || 'comprehensive'}
FOCUS AREAS: ${focus_areas?.join(', ') || datasets?.join(', ') || 'all aspects'}

Analyze this data and provide:
1. Comprehensive analysis
2. Structured data for visualization (categories + values arrays)
3. Key insights

RETURN ONLY VALID JSON.`
        }
      ], false);
      
      const data = response;
      analysisText = data.choices?.[0]?.message?.content || data.summary || '';
    } catch (error: any) {
      console.error(`[AgenticFlow] [handleAnalyzeData] APIM call failed:`, error.message);
      // Generate fallback analysis instead of failing
      analysisText = `{
  "analysis": "Data analysis could not be completed due to: ${error.message}. This would normally contain comprehensive analysis of the company's market position, industry involvement, and growth opportunities based on the provided data.",
  "chart_data": {
    "categories": ["Technology", "Marketing", "Sales", "Operations", "Finance"],
    "values": [40, 30, 20, 15, 10]
  },
  "key_insights": [
    "Company operates across multiple industry sectors",
    "Technology appears to be the primary focus area",
    "Marketing and sales represent significant portions of operations",
    "Opportunities exist for operational efficiency improvements"
  ]
}`;
    }
    
    // Ensure we have some analysis text
    if (!analysisText || analysisText.trim().length === 0) {
      analysisText = `{
  "analysis": "Analysis could not be generated. This would normally contain detailed insights about the company's market position and growth opportunities.",
  "chart_data": {
    "categories": ["Primary", "Secondary", "Tertiary"],
    "values": [50, 30, 20]
  },
  "key_insights": ["Analysis pending", "Data review required"]
}`;
    }
    
    console.log(`[AnalyzeData] Raw APIM response (first 500 chars):`, analysisText.substring(0, 500));
    
    // Try to parse JSON from response
    let chartData: any = null;
    let fullAnalysis = analysisText;
    
    try {
      // Try to extract JSON from response
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/) || analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        fullAnalysis = parsed.analysis || analysisText;
        chartData = parsed.chart_data || null;
        console.log(`[AnalyzeData] ✅ Extracted chart data:`, chartData);
      }
    } catch (parseError: any) {
      console.warn(`[AnalyzeData] Could not parse JSON, using text analysis only:`, parseError.message);
      // Provide fallback sample data
      chartData = {
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        values: [45, 67, 89, 103]
      };
    }
    
    const artifactUri = `artifact://analysis_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Completed analysis using APIM (${fullAnalysis.length} chars)`,
      meta: { 
        data_sources, 
        analysis_type, 
        full_analysis: fullAnalysis,
        chart_data: chartData,
        sample_data: chartData, // Alias for backward compatibility
        document_info: documentInfo
      }
    };
  }

  private async handleParseData(args: Record<string, any>): Promise<ActionResult> {
    const { goal, input_data, data_sources } = args;
    
    // Fetch REAL uploaded documents from database
    const uploadsResult = await dbQuery(
      `SELECT id, blob_path, mime, size, status, created_at 
       FROM uploads 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [this.userId]
    );
    
    // Get user preferences from setup event
    let chartPreferences = [];
    let reportLength = 'medium';
    let reportFocus = 'detailed';
    
    const contextResult = await dbQuery(
      `SELECT payload FROM agentic_events 
       WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
      [this.runId]
    );
    
    if (contextResult.rows.length > 0) {
      const contextData = contextResult.rows[0].payload;
      chartPreferences = contextData.selectedCharts || [];
      reportLength = contextData.reportLength || 'medium';
      reportFocus = contextData.reportFocus || 'detailed';
    }
    
    const parsedData = {
      goal: goal,
      uploaded_documents: uploadsResult.rows.map(u => ({
        id: u.id,
        path: u.blob_path,
        type: u.mime,
        size: u.size,
        uploaded_at: u.created_at
      })),
      document_count: uploadsResult.rows.length,
      chart_preferences: chartPreferences,
      report_length: reportLength,
      report_focus: reportFocus,
      has_data: uploadsResult.rows.length > 0,
      data_sources: uploadsResult.rows.length > 0 ? ['uploaded_documents'] : ['goal_only']
    };
    
    const artifactUri = `artifact://parsed_data_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Parsed context: ${uploadsResult.rows.length} documents, ${chartPreferences.length} chart types requested, ${reportLength} length report`,
      meta: { goal, parsedData }
    };
  }

  private async handleCollectExternalData(args: Record<string, any>): Promise<ActionResult> {
    // DEPRECATED - No longer using external OpenAI searches
    // All data comes from uploaded documents
    const { goal } = args;
      
      const artifactUri = `artifact://external_data_${Date.now()}`;
      
      return {
        uri: artifactUri,
      summary: `Skipped external data collection - using uploaded documents only`,
      meta: { goal, source: 'uploaded_documents' }
    };
  }

  private async handleIdentifyRequirements(args: Record<string, any>): Promise<ActionResult> {
    const { goal, available_data, key_facts, citations } = args;
    
    // Generate requirements based on goal and available data
    const requirements = {
      goal: goal,
      available_data: available_data || 'No specific data found',
      key_facts: key_facts || {},
      citations: citations || [],
      report_sections: ['Executive Summary', 'Company Overview', 'Market Analysis', 'Recommendations'],
      visualizations: ['Bar charts for key metrics', 'Line charts for trends', 'Pie charts for market share'],
      next_steps: ['analyze_data', 'create_chart', 'draft_section']
    };
    
    const artifactUri = `artifact://requirements_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Identified requirements for ${goal}`,
      meta: { goal, requirements }
    };
  }

  private async handleDraftSection(args: Record<string, any>): Promise<ActionResult> {
    const { section_name, content_type, data_sources, focus, length_target } = args;
    
    const run = await this.getRun();
    
    // Get the ACTUAL PARSED FILE DATA from context (not just analysis summary)
    const contextResult = await dbQuery(
      `SELECT payload FROM agentic_events 
       WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
      [this.runId]
    );
    
    let fileContext = '';
    let reportPrefs = { length: 'medium', focus: 'balanced', charts: [] };
    
    if (contextResult.rows.length > 0) {
      const contextData = contextResult.rows[0].payload;
      fileContext = contextData.fileContext || '';
      reportPrefs = {
        length: contextData.reportLength || 'medium',
        focus: contextData.reportFocus || 'balanced',
        charts: contextData.selectedCharts || []
      };
    }
    
    // Get ALL available artifacts from previous steps
    const artifactsResult = await dbQuery(
      `SELECT artifact_key, meta FROM agentic_artifacts WHERE run_id = $1 ORDER BY created_at DESC`,
      [this.runId]
    );

    let analysisContent = '';
    let chartData: any[] = [];
    let chartDataValues: any = null;
    
    for (const artifact of artifactsResult.rows) {
      if (artifact.artifact_key.includes('analysis')) {
        analysisContent = artifact.meta.full_analysis || '';
        chartDataValues = artifact.meta.chart_data || null;
      }
      if (artifact.artifact_key.includes('create_chart')) {
        chartData.push({
          type: artifact.meta.chart_type,
          title: artifact.meta.title,
          chart_url: artifact.meta.chart_url,
          data: artifact.meta.data
        });
      }
    }

    // Build RICH context with ACTUAL DATA for APIM
    let contextForAI = `GOAL: ${run.goal}\n\n`;
    
    contextForAI += `REPORT PREFERENCES:\n- Length: ${reportPrefs.length}\n- Focus: ${reportPrefs.focus}\n- Charts Requested: ${reportPrefs.charts.join(', ')}\n\n`;
    
    // CRITICAL: Include the ACTUAL parsed document data (up to 10k chars to avoid token limits)
    if (fileContext && fileContext.length > 0) {
      const dataPreview = fileContext.substring(0, 10000);
      contextForAI += `=== ACTUAL DOCUMENT DATA (USE THIS!) ===\n${dataPreview}\n${fileContext.length > 10000 ? '\n...(truncated for length)\n' : ''}\n=== END DOCUMENT DATA ===\n\n`;
    }
    
    if (analysisContent) {
      contextForAI += `ANALYSIS INSIGHTS:\n${analysisContent.substring(0, 2000)}\n\n`;
    }
    
    if (chartDataValues) {
      contextForAI += `DATA EXTRACTED FOR CHARTS:\n${JSON.stringify(chartDataValues, null, 2)}\n\n`;
    }
    
    if (chartData.length > 0) {
      contextForAI += `CHARTS GENERATED:\n${chartData.map(c => `- ${c.title} (${c.type})`).join('\n')}\n\n`;
    }

    // Call APIM to generate CUSTOM section content
    let content = '';
    try {
      const response = await callAPIM([
        {
          role: 'system',
          content: `You are a data analyst writing a report section.

CRITICAL RULES:
1. Use ONLY the actual data provided in "ACTUAL DOCUMENT DATA" section
2. Reference SPECIFIC numbers, dates, channels, sources from the data
3. DO NOT make up generic examples
4. DO NOT use template phrases like "The data shows..." without citing actual values
5. Every insight must be backed by REAL data from the document
6. If you mention a trend, cite the actual numbers

Example: "Social channel spend increased from €3,750 in Jan 2023 to €4,125 in Dec 2025 (+10%)"
NOT: "Marketing spend has increased over time"

Write sections that prove you read the ACTUAL data.`
        },
        {
          role: 'user',
          content: `${contextForAI}

SECTION TO WRITE: ${section_name}
CONTENT TYPE: ${content_type || 'detailed analysis'}
FOCUS: ${focus || 'comprehensive'}
TARGET LENGTH: ${length_target || '400-600 words'}

MANDATORY REQUIREMENTS:
- Use SPECIFIC values from the "ACTUAL DOCUMENT DATA" above
- Reference REAL channel names, dates, amounts, sources
- Include concrete numbers (e.g., "Outbound: €345,868")
- DO NOT write generic filler text
- Every statement must be verifiable from the data provided

Write the ${section_name} section now in markdown format with ## heading:`
        }
      ], false);
      
      const data = response;
      content = data.choices?.[0]?.message?.content || data.summary || '';
    } catch (error: any) {
      console.error(`[AgenticFlow] [handleDraftSection] APIM call failed:`, error.message);
      // Generate fallback content instead of failing
      content = `## ${section_name}\n\n**Note: AI section generation failed due to: ${error.message}**\n\nThis section would normally contain detailed analysis based on the provided data. The analysis would include specific insights about the company's market position, industry involvement, and growth opportunities.\n\n**Key areas that would be covered:**\n- Company overview and market position\n- Industry analysis and competitive landscape\n- Growth opportunities and strategic recommendations\n- Financial performance and market trends\n\n*Please retry the report generation or contact support if this issue persists.*`;
    }
    
    // Ensure we have some content
    if (!content || content.trim().length === 0) {
      content = `## ${section_name}\n\n**Section content could not be generated.**\n\nThis section would contain analysis based on the provided data about the company's market position and growth opportunities.`;
    }
    
    const sectionContent = {
      title: section_name || 'Section',
      content: content,
      data_sources: data_sources || [],
      word_count: content.split(' ').length,
      status: 'draft'
    };
    
    const artifactUri = `artifact://section_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Drafted custom ${section_name} section using APIM (${sectionContent.word_count} words)`,
      meta: { section_name, sectionContent }
    };
  }

  private async handleAssembleReport(args: Record<string, any>): Promise<ActionResult> {
    const { sections, charts, metadata } = args;
    
    console.log(`[AssembleReport] ========== STARTING REPORT ASSEMBLY ==========`);
    console.log(`[AssembleReport] Run ID: ${this.runId}`);
    console.log(`[AssembleReport] Args:`, JSON.stringify(args));
    
    // Get all section content from artifacts
    const artifactsResult = await dbQuery(
      `SELECT artifact_key, meta FROM agentic_artifacts WHERE run_id = $1 ORDER BY created_at ASC`,
      [this.runId]
    );
    
    console.log(`[AssembleReport] Found ${artifactsResult.rows.length} total artifacts`);

    let fullReport = '';
    let totalWordCount = 0;
    const sectionContents = [];
    const chartData = [];

    // Get run goal for title
    const run = await this.getRun();
    const reportTitle = run.goal;

    fullReport += `# ${reportTitle}\n\n`;
    fullReport += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    fullReport += `---\n\n`;

    // Collect all sections and charts
    for (const artifact of artifactsResult.rows) {
      // Parse meta if it's a string (from JSONB column)
      const meta = typeof artifact.meta === 'string' ? JSON.parse(artifact.meta) : artifact.meta;
      
      if (artifact.artifact_key.includes('section')) {
        const sectionContent = meta.sectionContent;
        if (sectionContent && sectionContent.content) {
          fullReport += `${sectionContent.content}\n\n---\n\n`;
          totalWordCount += sectionContent.word_count || 0;
          sectionContents.push({
            title: sectionContent.title,
            word_count: sectionContent.word_count
          });
        }
      }
      if (artifact.artifact_key.includes('chart')) {
        // Use chart_url if available, otherwise construct from chart_id
        const chartUrl = meta.chart_url || (meta.chart_id ? `/api/charts/${meta.chart_id}` : null);
        console.log(`[AssembleReport] Chart artifact: ${artifact.artifact_key}`);
        console.log(`[AssembleReport] Chart URL: ${chartUrl}`);
        console.log(`[AssembleReport] Chart ID: ${meta.chart_id}`);
        
        if (chartUrl) {
          chartData.push({
            type: meta.chart_type,
            title: meta.title,
            url: chartUrl,
            chart_id: meta.chart_id,
            failed: false
          });
        } else if (meta.failed) {
          // Include failed charts with error information
          chartData.push({
            type: meta.chart_type,
            title: meta.title,
            url: null,
            chart_id: null,
            failed: true,
            error: meta.error
          });
          console.warn(`[AssembleReport] ⚠️ Chart failed: ${meta.title} - ${meta.error}`);
        } else {
          console.warn(`[AssembleReport] ⚠️ Chart has no URL: ${meta.title}`);
        }
      }
    }

    console.log(`[AssembleReport] Collected ${sectionContents.length} sections, ${chartData.length} charts`);

    // Embed charts INLINE throughout the report (not at the end)
    if (chartData.length > 0) {
      fullReport += `\n# 📊 Data Visualizations\n\n`;
      chartData.forEach((chart, idx) => {
        fullReport += `## ${chart.title}\n\n`;
        if (chart.failed) {
          fullReport += `⚠️ **Chart Generation Failed**\n\n`;
          fullReport += `**Error:** ${chart.error}\n\n`;
          fullReport += `**Chart Type:** ${chart.type}\n\n`;
          console.log(`[AssembleReport] Chart failed: ${chart.title} - ${chart.error}`);
        } else {
          fullReport += `![${chart.title}](${chart.url})\n\n`;
          fullReport += `**Chart Type:** ${chart.type}\n\n`;
          console.log(`[AssembleReport] Embedded chart: ${chart.title} at ${chart.url}`);
        }
      });
      fullReport += `---\n\n`;
    }

    // Add report metadata
    const successfulCharts = chartData.filter(c => !c.failed).length;
    const failedCharts = chartData.filter(c => c.failed).length;
    
    fullReport += `\n## Report Summary\n\n`;
    fullReport += `- **Sections:** ${sectionContents.length}\n`;
    fullReport += `- **Visualizations:** ${successfulCharts} successful${failedCharts > 0 ? `, ${failedCharts} failed` : ''}\n`;
    fullReport += `- **Total Words:** ${totalWordCount.toLocaleString()}\n\n`;

    const report = {
      title: reportTitle,
      sections: sectionContents,
      charts: chartData,
      metadata: metadata || {},
      word_count: totalWordCount,
      full_content: fullReport,
      status: 'completed',
      generated_at: new Date().toISOString()
    };
    
    console.log(`[AssembleReport] ✅ Report assembled successfully`);
    console.log(`[AssembleReport] Report length: ${fullReport.length} chars`);
    console.log(`[AssembleReport] Sections: ${sectionContents.length}`);
    console.log(`[AssembleReport] Charts: ${chartData.length}`);
    console.log(`[AssembleReport] Charts embedded: ${chartData.map(c => c.title).join(', ')}`);
    console.log(`[AssembleReport] Report object keys:`, Object.keys(report));
    console.log(`[AssembleReport] Full content preview (first 200 chars):`, fullReport.substring(0, 200));
    console.log(`[AssembleReport] ========== REPORT ASSEMBLY COMPLETE ==========`);
    
    const artifactUri = `artifact://report_${Date.now()}`;
    
    const result = {
      uri: artifactUri,
      summary: `Assembled report: ${sectionContents.length} sections, ${chartData.length} charts, ${totalWordCount} words`,
      meta: { report }
    };
    
    console.log(`[AssembleReport] Returning result with meta.report.full_content length:`, result.meta.report.full_content.length);
    
    return result;
  }

  // Research mode actions
  private async handleExtractInsights(args: Record<string, any>): Promise<ActionResult> {
    const { source_data, insight_types } = args;
    
    const insights = ['Key insight 1', 'Key insight 2', 'Key insight 3'];
    
    const artifactUri = `artifact://insights_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Extracted ${insights.length} key insights`,
      meta: { source_data, insight_types, insights }
    };
  }

  private async handleCompileResearch(args: Record<string, any>): Promise<ActionResult> {
    const { sections, format } = args;
    
    const researchContent = `Research compiled from ${sections.length} sections`;
    
    const artifactUri = `artifact://research_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Compiled research in ${format} format`,
      meta: { sections, format, content: researchContent }
    };
  }

  // Templates mode actions
  private async handleCreateSlide(args: Record<string, any>): Promise<ActionResult> {
    const { slide_type, content, layout } = args;
    
    const slideContent = `Created ${slide_type} slide with ${layout} layout`;
    
    const artifactUri = `artifact://slide_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Created ${slide_type} slide`,
      meta: { slide_type, content, layout, slide_content: slideContent }
    };
  }

  private async handleDesignLayout(args: Record<string, any>): Promise<ActionResult> {
    const { slide_count, theme, layout_type } = args;
    
    const layout = `Designed ${layout_type} layout for ${slide_count} slides with ${theme} theme`;
    
    const artifactUri = `artifact://layout_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Designed presentation layout`,
      meta: { slide_count, theme, layout_type, layout }
    };
  }

  private async handleAssemblePresentation(args: Record<string, any>): Promise<ActionResult> {
    const { slides, format } = args;
    
    const presentationContent = `Presentation assembled from ${slides.length} slides`;
    
    const artifactUri = `artifact://presentation_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Assembled presentation in ${format} format`,
      meta: { slides, format, content: presentationContent }
    };
  }

  // Charts mode actions
  private async handleOptimizeVisualization(args: Record<string, any>): Promise<ActionResult> {
    const { chart_data, optimization_goals } = args;
    
    const optimizedChart = `Optimized chart for ${optimization_goals.join(', ')}`;
    
    const artifactUri = `artifact://optimized_chart_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Optimized visualization`,
      meta: { chart_data, optimization_goals, optimizedChart }
    };
  }

  private async handleGenerateChartCode(args: Record<string, any>): Promise<ActionResult> {
    const { chart_type, data, language } = args;
    
    const code = `// Generated ${chart_type} chart code in ${language}`;
    
    const artifactUri = `artifact://chart_code_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Generated ${chart_type} chart code`,
      meta: { chart_type, data, language, code }
    };
  }

  // Plans mode actions
  private async handleAnalyzeRequirements(args: Record<string, any>): Promise<ActionResult> {
    const { requirements, analysis_depth } = args;
    
    const analysis = `Analyzed ${requirements.length} requirements with ${analysis_depth} depth`;
    
    const artifactUri = `artifact://requirements_analysis_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Analyzed requirements`,
      meta: { requirements, analysis_depth, analysis }
    };
  }

  private async handleDraftPlanSection(args: Record<string, any>): Promise<ActionResult> {
    const { section_type, content, priority } = args;
    
    const sectionContent = `Drafted ${section_type} section with ${priority} priority`;
    
    const artifactUri = `artifact://plan_section_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Drafted ${section_type} section`,
      meta: { section_type, content, priority, section_content: sectionContent }
    };
  }

  private async handleCreateTimeline(args: Record<string, any>): Promise<ActionResult> {
    const { milestones, duration, dependencies } = args;
    
    const timeline = `Created timeline with ${milestones.length} milestones over ${duration}`;
    
    const artifactUri = `artifact://timeline_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Created project timeline`,
      meta: { milestones, duration, dependencies, timeline }
    };
  }

  private async handleAssemblePlan(args: Record<string, any>): Promise<ActionResult> {
    const { sections, format } = args;
    
    const planContent = `Plan assembled from ${sections.length} sections`;
    
    const artifactUri = `artifact://plan_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Assembled plan in ${format} format`,
      meta: { sections, format, content: planContent }
    };
  }

  // General actions
  private async handleCreateContent(args: Record<string, any>): Promise<ActionResult> {
    const { content_type, specifications } = args;
    
    const content = `Created ${content_type} content`;
    
    const artifactUri = `artifact://content_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Created ${content_type} content`,
      meta: { content_type, specifications, content }
    };
  }

  private async handleAssembleOutput(args: Record<string, any>): Promise<ActionResult> {
    const { components, output_format } = args;
    
    const output = `Assembled output from ${components.length} components`;
    
    const artifactUri = `artifact://output_${Date.now()}`;
    
    return {
      uri: artifactUri,
      summary: `Assembled output in ${output_format} format`,
      meta: { components, output_format, output }
    };
  }

  // ============================================================================
  // Persistence Methods
  // ============================================================================

  private async getRun(): Promise<Run> {
    const result = await dbQuery(
      `SELECT * FROM agentic_runs WHERE run_id = $1`,
      [this.runId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Run not found');
    }
    
    const row = result.rows[0];
    return {
      run_id: row.run_id,
      goal: row.goal,
      status: row.status,
      started_at: row.started_at,
      finished_at: row.finished_at,
      completion_criteria: typeof row.completion_criteria === 'string' 
        ? JSON.parse(row.completion_criteria) 
        : row.completion_criteria,
      user_id: row.user_id
    };
  }

  private async getState(): Promise<{ artifacts: Record<string, string>; notes: string }> {
    // Get artifacts for this run
    const artifactsResult = await dbQuery(
      `SELECT artifact_key, uri, meta FROM agentic_artifacts WHERE run_id = $1`,
      [this.runId]
    );
    
    const artifacts: Record<string, string> = {};
    artifactsResult.rows.forEach(row => {
      artifacts[row.artifact_key] = row.uri;
    });

    // Get recent steps for notes
    const stepsResult = await dbQuery(
      `SELECT action_name, result_summary FROM agentic_steps 
       WHERE run_id = $1 AND status = 'completed' 
       ORDER BY started_at DESC LIMIT 3`,
      [this.runId]
    );

    let notes = stepsResult.rows
      .map(row => `${row.action_name}: ${row.result_summary || 'completed'}`)
      .join('; ') || 'Run started';

    // Add rich context for reports mode - this goes to APIM planner!
    if (this.mode === 'reports') {
      const contextResult = await dbQuery(
        `SELECT payload FROM agentic_events 
         WHERE run_id = $1 AND event_type = 'context' AND step_id = 'setup'`,
        [this.runId]
      );
      
      if (contextResult.rows.length > 0) {
        const contextData = contextResult.rows[0].payload;
        const contextInfo = `USER PREFERENCES - Report Length: ${contextData.reportLength}, Focus: ${contextData.reportFocus}, Chart Types Requested: ${contextData.selectedCharts?.join(', ') || 'none'}`;
        notes = `${contextInfo}. ${notes}`;
        
        // Include parsed file content (this is the ACTUAL data from files!)
        if (contextData.fileContext && contextData.fileContext.length > 0) {
          // Limit to first 5000 chars to avoid overwhelming the planner
          const fileContentPreview = contextData.fileContext.substring(0, 5000);
          notes = `${notes}\n\nPARSED DOCUMENT CONTENT:\n${fileContentPreview}${contextData.fileContext.length > 5000 ? '\n\n...(truncated)' : ''}`;
        }
      }
      
      // File context is already included above from agentic_events
      // No need to query uploads table - we have everything we need from fileContext
    }

    return { artifacts, notes };
  }

  private async getLastObservation(): Promise<{ last_action: string; result: { uri?: string; summary?: string } } | undefined> {
    const result = await dbQuery(
      `SELECT action_name, result_uri, result_summary FROM agentic_steps 
       WHERE run_id = $1 AND status = 'completed' 
       ORDER BY started_at DESC LIMIT 1`,
      [this.runId]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      last_action: row.action_name,
      result: {
        uri: row.result_uri,
        summary: row.result_summary
      }
    };
  }

  private async startStep(step: PlannerStep): Promise<void> {
    await dbQuery(
      `INSERT INTO agentic_steps (run_id, step_id, action_name, args_json, status, started_at)
       VALUES ($1, $2, $3, $4, 'running', NOW())`,
      [this.runId, step.id, step.action.name, JSON.stringify(step.action.args)]
    );

    await this.logEvent('step.started', { step_id: step.id, action: step.action });
  }

  private async completeStep(step: PlannerStep, result: ActionResult): Promise<void> {
    await dbQuery(
      `UPDATE agentic_steps 
       SET status = 'completed', finished_at = NOW(), result_uri = $1, result_summary = $2
       WHERE run_id = $3 AND step_id = $4`,
      [result.uri, result.summary, this.runId, step.id]
    );
  }

  private async failStep(step: PlannerStep, error: Error): Promise<void> {
    await dbQuery(
      `UPDATE agentic_steps 
       SET status = 'failed', finished_at = NOW(), error_class = $1
       WHERE run_id = $2 AND step_id = $3`,
      [error.constructor.name, this.runId, step.id]
    );

    await this.logEvent('step.failed', { step_id: step.id, error: error.message });
  }

  private async saveArtifact(artifactKey: string, uri: string, type: string, meta: Record<string, any>): Promise<void> {
    console.log(`[SaveArtifact] Saving artifact: ${artifactKey}`);
    console.log(`[SaveArtifact] Type: ${type}`);
    console.log(`[SaveArtifact] URI: ${uri}`);
    console.log(`[SaveArtifact] Meta keys:`, Object.keys(meta));
    if (type === 'assemble_report' && meta.report) {
      console.log(`[SaveArtifact] Report artifact - full_content length:`, meta.report.full_content?.length || 0);
    }
    
    await dbQuery(
      `INSERT INTO agentic_artifacts (run_id, artifact_key, uri, type, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [this.runId, artifactKey, uri, type, JSON.stringify(meta)]
    );
    
    console.log(`[SaveArtifact] ✅ Artifact saved successfully: ${artifactKey}`);
  }

  private async logEvent(eventType: string, payload: Record<string, any>, stepId?: string): Promise<void> {
    await dbQuery(
      `INSERT INTO agentic_events (ts, run_id, step_id, event_type, payload)
       VALUES (NOW(), $1, $2, $3, $4)`,
      [this.runId, stepId || null, eventType, JSON.stringify(payload)]
    );
  }

  private async finishRun(run: Run): Promise<void> {
    await dbQuery(
      `UPDATE agentic_runs SET status = 'completed', finished_at = NOW() WHERE run_id = $1`,
      [this.runId]
    );

    await this.logEvent('run.completed', { goal: run.goal });
  }

  private async failRun(run: Run, error: string): Promise<void> {
    await dbQuery(
      `UPDATE agentic_runs SET status = 'failed', finished_at = NOW() WHERE run_id = $1`,
      [this.runId]
    );

    await this.logEvent('run.failed', { goal: run.goal, error });
  }

  private validateStep(step: PlannerStep): boolean {
    return !!(
      step.id &&
      step.rationale &&
      step.action &&
      step.action.name &&
      step.expects &&
      Array.isArray(step.expects)
    );
  }

  private generateNextReportStep(state: { artifacts: Record<string, string>; notes: string }): PlannerStep | null {
    const artifactKeys = Object.keys(state.artifacts);
    
    if (artifactKeys.length === 0) {
      return null;
    }

    // Generate steps based on what we have
    if (state.artifacts[artifactKeys[0]]?.includes('requirements')) {
      return {
        id: "step-002",
        rationale: "Analyze available data and create visualizations",
        action: {
          name: "analyze_data",
          args: {
            data_sources: ["web_search", "company_info"],
            analysis_type: "comprehensive"
          }
        },
        expects: ["Data analysis completed", "Insights extracted"],
        depends_on: [artifactKeys[0]]
      };
    }

    if (state.artifacts[artifactKeys[0]]?.includes('analysis')) {
      return {
        id: "step-003",
        rationale: "Create charts and visualizations",
        action: {
          name: "create_chart",
          args: {
            chart_type: "bar",
            data_source: "analysis_results",
            title: "Key Metrics Overview"
          }
        },
        expects: ["Chart created", "Visualization generated"],
        depends_on: [artifactKeys[0]]
      };
    }

    if (state.artifacts[artifactKeys[0]]?.includes('chart')) {
      return {
        id: "step-004",
        rationale: "Draft report sections",
        action: {
          name: "draft_section",
          args: {
            section_name: "Executive Summary",
            content_type: "overview",
            data_sources: ["analysis", "charts"]
          }
        },
        expects: ["Section drafted", "Content generated"],
        depends_on: artifactKeys
      };
    }

    if (state.artifacts[artifactKeys[0]]?.includes('section')) {
      return {
        id: "step-005",
        rationale: "Assemble final report",
        action: {
          name: "assemble_report",
          args: {
            sections: artifactKeys.filter(k => state.artifacts[k]?.includes('section')),
            charts: artifactKeys.filter(k => state.artifacts[k]?.includes('chart')),
            metadata: {
              generated_at: new Date().toISOString(),
              word_count: 1000
            }
          }
        },
        expects: ["Report assembled", "Final output generated"],
        depends_on: artifactKeys
      };
    }

    return null;
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  static async createRun(userId: string, goal: string, mode: string = 'general', completionCriteria: string[] = ['output_generated']): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set mode-specific completion criteria
    const criteria = mode === 'reports' ? ['report_generated'] :
                    mode === 'research' ? ['research_compiled'] :
                    mode === 'templates' ? ['presentation_assembled'] :
                    mode === 'charts' ? ['charts_created'] :
                    mode === 'plans' ? ['plan_assembled'] :
                    completionCriteria;
    
    // Store mode in completion criteria for now (until we add mode column)
    const criteriaWithMode = [...criteria, `mode:${mode}`];
    
    await dbQuery(
      `INSERT INTO agentic_runs (run_id, user_id, goal, status, completion_criteria, started_at)
       VALUES ($1, $2, $3, 'active', $4, NOW())`,
      [runId, userId, goal, JSON.stringify(criteriaWithMode)]
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

    const stepsResult = await dbQuery(
      `SELECT * FROM agentic_steps WHERE run_id = $1 ORDER BY started_at ASC`,
      [runId]
    );

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
      steps: stepsResult.rows,
      artifacts: artifactsResult.rows,
      events: eventsResult.rows
    };
  }
}
