/**
 * Reports API Routes - Tool-Based Report Generation with Charts
 * Per Kevin's plan: All business logic stays in API
 * 
 * Features:
 * - Intelligent planning based on goal + UI inputs (length, focus, charts)
 * - Data-driven report generation
 * - Integrated chart generation
 * - SSE streaming for progress
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchWeb, isOpenAIConfigured } from '../services/openaiSearch.js';
import { ChartService } from '../services/chartService.js';
import { callAPIM } from '../services/agenticFlow.js';

const router = Router();

// Apply auth middleware to all routes EXCEPT /stream/:runId (EventSource can't send headers)
router.use((req, res, next) => {
  if (req.path.match(/^\/stream\//)) {
    return next();
  }
  return requireAuth(req, res, next);
});

interface UploadedFile {
  uploadId: string;
  fileName: string;
  content: string;
}

/**
 * TOOL-BASED REPORT PLANNING
 * APIM creates a comprehensive report plan based on:
 * - User's goal
 * - Report length (short/medium/long)
 * - Report focus
 * - Requested charts
 * - Uploaded documents
 */
async function createReportPlan(
  goal: string,
  uploadedFiles: UploadedFile[],
  reportLength: string,
  reportFocus?: string,
  selectedCharts?: string[],
  regenerationContext?: {
    isRegeneration: boolean;
    feedback: string | null;
    originalReport: string | null;
  }
): Promise<{
  understanding: {
    coreSubject: string;
    reportType: string;
    keyQuestions: string[];
    dataGaps: string[];
    chartOpportunities: Array<{type: string; purpose: string; dataNeeded: string}>;
  };
  toolCalls: Array<{
    tool: string;
    parameters: any;
    reasoning: string;
  }>;
}> {
  // Define available tools for report generation
  const tools = [
    {
      name: "analyze_documents",
      description: "Extract insights, data, and key facts from uploaded documents",
      parameters: {
        focus: "string - what specific information to extract for the report"
      }
    },
    {
      name: "search_web",
      description: "Search for additional data, facts, benchmarks, or context",
      parameters: {
        searchQuery: "string - specific search query for additional information"
      }
    },
    {
      name: "generate_chart",
      description: "Create data visualizations to enhance the report",
      parameters: {
        chartType: "string - bar, line, pie, scatter, heatmap, etc",
        dataNeeded: "string - what quantitative data is needed",
        goal: "string - what insight the chart should convey"
      }
    },
    {
      name: "draft_section",
      description: "Write a specific report section",
      parameters: {
        sectionName: "string - name of the section",
        content: "string - key points to include in this section"
      }
    },
    {
      name: "compile_report",
      description: "Assemble all sections and charts into final report",
      parameters: {
        structure: "array of strings - ordered list of section names"
      }
    }
  ];

  // Extract document content if available (LIMIT to prevent APIM payload errors)
  const documentContent = uploadedFiles.length > 0
    ? uploadedFiles.map(f => {
        const content = f.content || '(no content)';
        // Limit each file to 5000 chars to prevent APIM 500 errors
        const limitedContent = content.length > 5000 
          ? content.substring(0, 5000) + '\n\n[...document truncated for API limits...]'
          : content;
        return `FILE: ${f.fileName}\nCONTENT:\n${limitedContent}`;
      }).join('\n\n---\n\n')
    : null;

  // ✅ BUILD REGENERATION CONTEXT (if applicable)
  const regenerationInstructions = regenerationContext?.isRegeneration ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 REGENERATION MODE ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is a REGENERATION, NOT a new report request.

ORIGINAL REPORT (what you generated before):
${regenerationContext.originalReport ? regenerationContext.originalReport.substring(0, 3000) + '...[truncated]' : '(not available)'}

USER'S FEEDBACK FOR CHANGES:
${regenerationContext.feedback || '(no specific feedback - regenerate fresh)'}

CRITICAL REGENERATION RULES:
- You already created a report for this (see ORIGINAL REPORT above)
- User wants you to MODIFY/IMPROVE that report based on their feedback
- You MAY skip redundant searches if the original report has sufficient info
- You MAY skip redundant charts if they already exist in original
- Focus on INCORPORATING THE FEEDBACK, not starting from scratch
- If no feedback: regenerate with improved quality/structure

YOUR TASK:
- Read the original report to understand what was already done
- Apply the user's requested changes (if any)
- Only search/generate NEW content if gaps exist or feedback requires it
- Create a better version that addresses the feedback

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const systemPrompt = `You are an intelligent report planning AI with access to tools.
${regenerationInstructions}
YOUR JOB:
1. UNDERSTAND the user's goal and what type of report they need
2. IDENTIFY what data/information is available and what's missing
3. PLAN which charts would be most valuable
4. CREATE a step-by-step execution plan using available tools

CRITICAL RULES FOR REPORTS:
- Reports are FORMAL BUSINESS ANALYSIS (paragraphs, not bullet points!)
- Reports should be FOCUSED and DATA-DRIVEN, NOT encyclopedic
- If user uploaded documents, analyze them FIRST and prefer document data
- Web searches: ${reportLength === 'short' ? '1-2 maximum' : reportLength === 'long' ? '3-4 maximum' : '2-3 maximum'} (ONLY if critical data missing!)
- Chart types requested by user: ${selectedCharts && selectedCharts.length > 0 ? selectedCharts.join(', ') : 'none specified - suggest 1-2 valuable ones'}
- Report length: ${reportLength} (short=2-3 sections MAX, medium=3-4 sections MAX, long=4-5 sections MAX)
${reportFocus ? `- Report focus: ${reportFocus}` : ''}
- Include charts that add REAL VALUE (not decorative) - limit to 1-2 max
- Structure should be logical: Executive Summary → Analysis → Recommendations (3 sections is ideal)
- Charts should be placed INLINE with relevant sections (not dumped at end)

AVAILABLE TOOLS:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

PLANNING STRATEGY (KEEP IT EFFICIENT!):
1. If documents provided: Start with analyze_documents (MOST IMPORTANT!)
2. ONLY search_web if CRITICAL data is missing (1 search ONLY!)
3. Plan charts: Use generate_chart ONLY for key visualizations (1-2 MAX!)
4. Plan sections: Use draft_section for ONLY 3-4 sections (NOT MORE!)
5. Finalize: Use compile_report to assemble everything

EFFICIENCY RULES (STRICT ENFORCEMENT):
- Prefer document data over web search
- search_web: ${reportLength === 'short' ? '1-2 calls' : reportLength === 'long' ? '3-4 calls' : '2-3 calls'} MAXIMUM (based on report length)
- generate_chart: 1-2 calls MAXIMUM (not 3+)
- draft_section: 3-4 calls MAXIMUM (NOT 5, 6, 7+)
- Keep total tool calls under ${reportLength === 'short' ? '7' : reportLength === 'long' ? '12' : '10'} steps

OUTPUT FORMAT (STRICT JSON):
{
  "understanding": {
    "coreSubject": "what/who this report is about",
    "reportType": "analytical/strategic/operational/etc",
    "keyQuestions": ["question 1", "question 2"],
    "dataGaps": ["gap 1", "gap 2"],
    "chartOpportunities": [
      {"type": "bar", "purpose": "compare X vs Y", "dataNeeded": "specific metrics"}
    ]
  },
  "toolCalls": [
    {
      "tool": "analyze_documents",
      "parameters": {"focus": "extract financial data and performance metrics"},
      "reasoning": "need to understand current state from docs"
    },
    {
      "tool": "search_web",
      "parameters": {"searchQuery": "industry benchmarks 2024 market data"},
      "reasoning": "need external benchmarks for comparison"
    },
    {
      "tool": "generate_chart",
      "parameters": {
        "chartType": "bar",
        "dataNeeded": "quarterly revenue 2024",
        "goal": "show revenue growth trend"
      },
      "reasoning": "visual representation of growth"
    },
    {
      "tool": "draft_section",
      "parameters": {
        "sectionName": "Executive Summary",
        "content": "overview of findings and key insights"
      },
      "reasoning": "start with high-level overview"
    },
    {
      "tool": "compile_report",
      "parameters": {
        "structure": ["Executive Summary", "Analysis", "Recommendations"]
      },
      "reasoning": "assemble final report"
    }
  ]
}

RETURN ONLY VALID JSON!`;

  const userPrompt = `Create a comprehensive report plan:

GOAL: ${goal}

${documentContent ? `UPLOADED DOCUMENTS:\n${documentContent}\n\n` : 'NO DOCUMENTS PROVIDED - will need external research\n\n'}

REPORT LENGTH: ${reportLength}
${reportFocus ? `REPORT FOCUS: ${reportFocus}\n` : ''}
${selectedCharts && selectedCharts.length > 0 ? `REQUESTED CHART TYPES: ${selectedCharts.join(', ')}\n` : ''}

Create a detailed execution plan that will result in a data-driven, comprehensive report.`;

  console.log('[ReportPlan] Calling APIM for tool-based planning...');
  
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response: any = await callAPIM(messages);
    const content = response.choices[0].message.content;
    
    // Parse JSON response (with fallback handling)
    let parsed;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json?\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('[ReportPlan] JSON parse failed, using fallback plan');
      // Fallback plan
      parsed = {
        understanding: {
          coreSubject: goal,
          reportType: 'analytical',
          keyQuestions: ['What are the key insights?', 'What are the recommendations?'],
          dataGaps: [],
          chartOpportunities: selectedCharts ? selectedCharts.map(type => ({
            type,
            purpose: `${type} visualization`,
            dataNeeded: 'relevant metrics'
          })) : []
        },
        toolCalls: [
          ...(uploadedFiles.length > 0 ? [{
            tool: 'analyze_documents',
            parameters: { focus: 'extract key insights and data' },
            reasoning: 'analyze provided documents'
          }] : []),
          {
            tool: 'search_web',
            parameters: { searchQuery: `${goal} analysis data 2024` },
            reasoning: 'gather additional context'
          },
          ...(selectedCharts || []).map(chartType => ({
            tool: 'generate_chart',
            parameters: {
              chartType,
              dataNeeded: `relevant ${chartType} chart data`,
              goal: `visualize key metrics`
            },
            reasoning: `create ${chartType} chart as requested`
          })),
          {
            tool: 'draft_section',
            parameters: { sectionName: 'Executive Summary', content: 'high-level overview' },
            reasoning: 'provide summary'
          },
          {
            tool: 'draft_section',
            parameters: { sectionName: 'Analysis', content: 'detailed analysis' },
            reasoning: 'provide analysis'
          },
          {
            tool: 'draft_section',
            parameters: { sectionName: 'Recommendations', content: 'actionable recommendations' },
            reasoning: 'provide recommendations'
          },
          {
            tool: 'compile_report',
            parameters: { structure: ['Executive Summary', 'Analysis', 'Recommendations'] },
            reasoning: 'assemble final report'
          }
        ]
      };
    }

    console.log(`[ReportPlan] ✅ Plan created with ${parsed.toolCalls.length} steps`);
    return parsed;

  } catch (error: any) {
    console.error('[ReportPlan] APIM call failed:', error);
    throw new Error(`Planning failed: ${error.message}`);
  }
}

/**
 * POST /reports/generate
 * Generate a comprehensive report with charts
 */
router.post('/generate', async (req, res) => {
  try {
    const { goal, reportLength, reportFocus, selectedCharts, uploaded_files } = req.body;
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    if (!goal) {
      return res.status(400).json({ error: 'goal is required' });
    }

    const lengthValue = reportLength || 'medium';
    const uploadedFiles = uploaded_files || [];

    console.log(`[Reports] Starting generation:`, {
      goal: goal.substring(0, 50),
      length: lengthValue,
      focus: reportFocus,
      charts: selectedCharts,
      files: uploadedFiles.length
    });

    // Create run record
    const runId = `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await dbQuery(
      `INSERT INTO o1_research_runs (id, user_id, query, depth, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        runId,
        userId,
        goal,
        lengthValue,
        'running',
        JSON.stringify({
          mode: 'report',
          reportFocus,
          selectedCharts: selectedCharts || [],
          uploadIds: uploadedFiles.map((f: any) => f.uploadId)
        })
      ]
    );

    res.json({
      run_id: runId,
      status: 'running',
      message: 'Report generation started'
    });

    // Start async generation
    generateReportAsync(runId, userId, orgId, goal, lengthValue, reportFocus, selectedCharts, uploadedFiles).catch(err => {
      console.error('[Reports] Async generation error:', err);
    });

  } catch (error: any) {
    console.error('[Reports] Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /reports/stream/:runId
 * SSE stream for report generation progress
 */
router.get('/stream/:runId', async (req, res) => {
  const { runId } = req.params;
  const userId = req.auth?.sub as string; // Optional - EventSource can't send auth headers

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const emit = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Flush immediately for real-time streaming
    if ((res as any).flush) {
      (res as any).flush();
    }
  };

  try {
    // Get run details (runId is crypto-random, acts as access token)
    const result = await dbQuery(
      `SELECT * FROM o1_research_runs WHERE id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      emit('error', { message: 'Report run not found' });
      return res.end();
    }

    const run = result.rows[0];

    emit('report.init', {
      run_id: runId,
      goal: run.query,
      length: run.depth,
      status: run.status
    });

    // Track last emitted activity ID (more reliable than timestamp)
    let lastActivityId = 0;

    // Poll for activities and completion
    const pollInterval = setInterval(async () => {
      try {
        // Get new activities since last poll (by ID, not timestamp)
        const activitiesResult = await dbQuery(
          `SELECT * FROM o1_research_activities 
           WHERE run_id = $1 AND id > $2 
           ORDER BY id ASC`,
          [runId, lastActivityId]
        );

        // Emit new activities
        for (const activity of activitiesResult.rows) {
          emit(activity.activity_type, activity.activity_data);
          lastActivityId = activity.id; // Update to this activity's ID
        }

        // Check status
        const statusResult = await dbQuery(
          `SELECT status, report_content, metadata FROM o1_research_runs WHERE id = $1`,
          [runId]
        );

        if (statusResult.rows.length === 0) {
          clearInterval(pollInterval);
          emit('error', { message: 'Run not found' });
          return res.end();
        }

        const currentStatus = statusResult.rows[0].status;
        const reportContent = statusResult.rows[0].report_content;
        const metadata = statusResult.rows[0].metadata;

        // Emit progress updates if available
        if (metadata?.currentStep) {
          emit('report.progress', {
            step: metadata.currentStep,
            total: metadata.totalSteps || 0,
            message: metadata.currentMessage || ''
          });
        }

        if (currentStatus === 'completed' && reportContent) {
          clearInterval(pollInterval);
          emit('report.completed', {
            run_id: runId,
            report_content: reportContent,
            status: 'completed'
          });
          return res.end();
        } else if (currentStatus === 'failed') {
          clearInterval(pollInterval);
          emit('error', { message: 'Report generation failed' });
          return res.end();
        }
      } catch (pollError) {
        console.error('[Reports] Polling error:', pollError);
        clearInterval(pollInterval);
        emit('error', { message: 'Polling failed' });
        return res.end();
      }
    }, 2000);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[Reports] Client disconnected from stream ${runId}`);
      clearInterval(pollInterval);
      res.end();
    });

  } catch (error: any) {
    console.error('[Reports] Stream error:', error);
    emit('error', { message: error.message });
    res.end();
  }
});

/**
 * Async report generation
 */
export async function generateReportAsync(
  runId: string,
  userId: string,
  orgId: string,
  goal: string,
  reportLength: string,
  reportFocus?: string,
  selectedCharts?: string[],
  uploadedFiles?: UploadedFile[]
) {
  // Add timeout protection - fail after 5 minutes
  const timeout = setTimeout(async () => {
    console.error(`[Reports] TIMEOUT after 5 minutes for runId: ${runId}`);
    await dbQuery(
      `UPDATE o1_research_runs
       SET status = 'failed',
           metadata = jsonb_set(metadata, '{error}', to_jsonb('Report generation timed out after 5 minutes'::text)),
           updated_at = NOW()
       WHERE id = $1 AND status = 'running'`,
      [runId]
    );
  }, 5 * 60 * 1000); // 5 minutes

  try {
    console.log(`[Reports] Generating report for: ${goal}`);
    
    // ✅ REGENERATION DETECTION: Check if this is a regeneration
    const runResult = await dbQuery(
      `SELECT metadata FROM o1_research_runs WHERE id = $1`,
      [runId]
    );
    const metadata = runResult.rows[0]?.metadata || {};
    const isRegeneration = !!metadata.regenerated_from;
    const regenerationFeedback = metadata.feedback || null;
    const originalReport = metadata.original_report || null;
    
    if (isRegeneration) {
      console.log('[Reports] 🔄 REGENERATION DETECTED:', {
        originalRunId: metadata.regenerated_from,
        hasFeedback: !!regenerationFeedback,
        feedbackLength: regenerationFeedback?.length || 0,
        hasOriginalReport: !!originalReport
      });
    }

    // Helper to emit SSE-style events to database for streaming
    const logActivity = async (activityType: string, activityData: any) => {
      try {
        await dbQuery(
          `INSERT INTO o1_research_activities (run_id, activity_type, activity_data, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [runId, activityType, JSON.stringify(activityData)]
        );
      } catch (err) {
        console.error('[Reports] Error logging activity:', err);
      }
    };

    // Update metadata with progress
    const updateProgress = async (currentStep: number, totalSteps: number, message: string) => {
      await dbQuery(
        `UPDATE o1_research_runs
         SET metadata = jsonb_set(
           jsonb_set(
             jsonb_set(metadata, '{currentStep}', to_jsonb($2::int)),
             '{totalSteps}', to_jsonb($3::int)
           ),
           '{currentMessage}', to_jsonb($4::text)
         )
         WHERE id = $1`,
        [runId, currentStep, totalSteps, message]
      );
    };

    // PHASE 1: Create intelligent plan
    console.log('[Reports] PHASE 1: Creating report plan...');
    await updateProgress(1, 10, 'Creating report plan...');
    
    await logActivity('thinking', {
      thought: 'Analyzing your request and planning report structure...',
      thought_type: 'planning'
    });
    
    const plan = await createReportPlan(
      goal,
      uploadedFiles || [],
      reportLength,
      reportFocus,
      selectedCharts,
      // ✅ PASS REGENERATION CONTEXT
      isRegeneration ? {
        isRegeneration: true,
        feedback: regenerationFeedback,
        originalReport: originalReport
      } : undefined
    );

    console.log(`[Reports] Plan created:`, {
      subject: plan.understanding.coreSubject,
      type: plan.understanding.reportType,
      steps: plan.toolCalls.length
    });

    // Show plan details
    await logActivity('thinking', {
      thought: `Report Subject: "${plan.understanding.coreSubject}"`,
      thought_type: 'analyzing'
    });

    await logActivity('thinking', {
      thought: `Report Type: ${plan.understanding.reportType}`,
      thought_type: 'analyzing'
    });

    if (plan.understanding.chartOpportunities.length > 0) {
      await logActivity('thinking', {
        thought: `Identified ${plan.understanding.chartOpportunities.length} chart opportunities`,
        thought_type: 'planning'
      });
    }

    await logActivity('thinking', {
      thought: `Execution Plan:\n${plan.toolCalls.map((tc, i) => `${i + 1}. ${tc.tool}\n   → ${tc.reasoning}`).join('\n')}`,
      thought_type: 'planning'
    });

    // PHASE 2: Execute plan
    console.log('[Reports] PHASE 2: Executing plan...');
    
    const artifacts: Record<string, any> = {
      documentInsights: [],
      webFindings: [],
      charts: [],
      sections: []
    };

    let stepNumber = 2;
    const totalSteps = plan.toolCalls.length + 2; // +2 for planning and finalization

    for (const toolCall of plan.toolCalls) {
      try {
        console.log(`[Reports] ⚙️  Executing: ${toolCall.tool} - ${toolCall.reasoning}`);
        await updateProgress(stepNumber, totalSteps, toolCall.reasoning);

        // Emit thinking event
        await logActivity('thinking', {
          thought: `Tool ${stepNumber - 1}/${plan.toolCalls.length}: ${toolCall.tool}`,
          thought_type: 'executing'
        });

      switch (toolCall.tool) {
        case 'analyze_documents':
          if (uploadedFiles && uploadedFiles.length > 0) {
            // Emit tool.call event
            await logActivity('tool.call', {
              tool: 'analyze_documents',
              purpose: toolCall.parameters.focus || `Analyze ${uploadedFiles.length} uploaded document${uploadedFiles.length > 1 ? 's' : ''}`
            });

            const focus = toolCall.parameters.focus || 'extract key insights';
            // Limit document content to prevent APIM 500 errors
            const documentContent = uploadedFiles.map(f => {
              const content = f.content || '';
              // Limit each file to 5000 chars
              const limitedContent = content.length > 5000
                ? content.substring(0, 5000) + '\n\n[...document truncated for API limits...]'
                : content;
              return `FILE: ${f.fileName}\n${limitedContent}`;
            }).join('\n\n---\n\n');

            const analysisPrompt = `Analyze these documents with focus on: ${focus}

DOCUMENTS:
${documentContent}

Extract:
1. Key insights and findings
2. Important data points and metrics
3. Context and background information

Be specific and cite the source documents.`;

            const response: any = await callAPIM([
              { role: 'system', content: 'You are an expert document analyst. Extract key insights and data.' },
              { role: 'user', content: analysisPrompt }
            ]);

            const insights = response.choices[0].message.content;
            artifacts.documentInsights.push(insights);

            // Emit tool.result event
            await logActivity('tool.result', {
              tool: 'document_analysis',
              insights_extracted: true,
              files_analyzed: uploadedFiles.length
            });
          }
          break;

        case 'search_web':
          const searchQuery = toolCall.parameters.searchQuery;
          console.log(`[Reports] Searching web: ${searchQuery}`);
          
          // Emit tool.call event
          await logActivity('tool.call', {
            tool: 'search_web',
            purpose: `Search: ${searchQuery}`
          });
          
          try {
            // ✅ FIX: Use NEW searchWeb format (returns {summary, findings[], sources[]})
            const searchResult = await searchWeb(searchQuery);
            
            // Build findings text from results
            const findingsText = [
              `Summary: ${searchResult.summary}`,
              '',
              'Key Findings:',
              ...searchResult.findings.map((f, i) => `${i + 1}. ${f}`),
              '',
              'Sources:',
              ...searchResult.sources.slice(0, 5).map((s, i) => `${i + 1}. ${s}`)
            ].join('\n');
            
            artifacts.webFindings.push({
              query: searchQuery,
              findings: findingsText,
              sources: searchResult.sources
            });

            console.log(`[Reports] ✅ Search completed: ${searchResult.findings.length} findings`);

            // Emit tool.result event
            await logActivity('tool.result', {
              tool: 'web_search',
              findings_found: true,
              findings_count: searchResult.findings.length,
              query: searchQuery
            });
          } catch (searchError: any) {
            console.error('[Reports] Search error:', searchError);
            artifacts.webFindings.push({
              query: searchQuery,
              findings: `Search failed: ${searchError.message}`,
              sources: []
            });

            // Emit failure
            await logActivity('tool.result', {
              tool: 'web_search',
              findings_found: false,
              error: searchError.message
            });
          }
          break;

        case 'generate_chart':
          console.log(`[Reports] Generating chart: ${toolCall.parameters.chartType}`);
          
          // Emit tool.call event
          await logActivity('tool.call', {
            tool: 'generate_chart',
            purpose: `Generate ${toolCall.parameters.chartType} chart: ${toolCall.parameters.goal || 'visualization'}`
          });
          
          try {
            const chartService = new ChartService();
            
            // ✅ FIX: Combine all available data for chart (increased limit)
            let allContext = [
              ...artifacts.documentInsights,
              ...artifacts.webFindings.map((f: any) => f.findings)
            ].join('\n\n');

            // ✅ FALLBACK: If insufficient data, search web for chart data
            if (allContext.length < 500) {
              console.log(`[Reports] 🔍 Insufficient data for chart, searching web: ${toolCall.parameters.dataNeeded}`);
              try {
                const searchQuery = `${toolCall.parameters.dataNeeded} ${toolCall.parameters.chartType} data statistics`;
                const searchResults = await searchWeb(searchQuery);
                
                if (searchResults && searchResults.findings && searchResults.findings.length > 0) {
                  const searchContext = searchResults.findings.join('\n\n');
                  
                  allContext = searchContext + '\n\n' + allContext;
                  console.log(`[Reports] ✅ Added search findings to chart context`);
                }
              } catch (searchError) {
                console.log(`[Reports] ⚠️  Web search failed, letting APIM generate synthetic data`);
              }
            }

            const chartRequest = {
              data: allContext.substring(0, 10000), // ✅ Increased from 3000 to 10000 chars
              chartType: toolCall.parameters.chartType,
              title: toolCall.parameters.goal || `${toolCall.parameters.chartType} Chart`,
              goal: toolCall.parameters.goal || `Visualize ${toolCall.parameters.dataNeeded}`
            };

            const chartResult = await chartService.generateChart(chartRequest);
            
            if (chartResult.success && chartResult.chart_url) {
              artifacts.charts.push({
                type: toolCall.parameters.chartType,
                url: chartResult.chart_url,
                purpose: toolCall.parameters.goal,
                failed: false
              });
              console.log(`[Reports] ✅ Chart generated: ${chartResult.chart_url}`);

              // Emit tool.result event
              await logActivity('tool.result', {
                tool: 'chart_generated',
                chart_type: toolCall.parameters.chartType,
                chart_url: chartResult.chart_url,
                success: true
              });
            } else {
              // ✅ Add failed chart placeholder to final report
              artifacts.charts.push({
                type: toolCall.parameters.chartType,
                url: null,
                purpose: toolCall.parameters.goal,
                failed: true,
                error: chartResult.error || 'Chart generation failed'
              });
              console.log(`[Reports] ⚠️  Chart failed, added placeholder`);
              
              await logActivity('tool.result', {
                tool: 'chart_generated',
                chart_type: toolCall.parameters.chartType,
                success: false
              });
            }
          } catch (chartError: any) {
            console.error('[Reports] Chart generation failed:', chartError);
            
            // ✅ Add failed chart placeholder to final report
            artifacts.charts.push({
              type: toolCall.parameters.chartType,
              url: null,
              purpose: toolCall.parameters.goal,
              failed: true,
              error: chartError.message
            });
            console.log(`[Reports] ⚠️  Chart error, added placeholder`);
            
            await logActivity('tool.result', {
              tool: 'chart_generated',
              success: false,
              error: chartError.message
            });
          }
          break;

        case 'draft_section':
          const sectionName = toolCall.parameters.sectionName;
          const sectionFocus = toolCall.parameters.content;

          // Emit tool.call event
          await logActivity('tool.call', {
            tool: 'draft_section',
            purpose: `Writing section: ${sectionName}`
          });

          const allData = [
            ...artifacts.documentInsights,
            ...artifacts.webFindings.map((f: any) => `SEARCH: ${f.query}\nFINDINGS: ${f.findings}`)
          ].join('\n\n---\n\n');

          // ✅ ENFORCE STRICT LENGTH LIMITS based on reportLength
          const lengthGuidelines = {
            short: { maxWords: 150, style: 'Be extremely concise. Only the most critical points.' },
            medium: { maxWords: 300, style: 'Be clear and focused. Key insights only.' },
            long: { maxWords: 500, style: 'Be thorough but avoid redundancy.' }
          };
          
          const guideline = lengthGuidelines[reportLength as keyof typeof lengthGuidelines] || lengthGuidelines.medium;
          
          // ✅ LIMIT DATA CONTEXT (prevent overwhelming APIM with too much data)
          const limitedData = allData.length > 2000 
            ? allData.substring(0, 2000) + '\n\n[Additional data truncated for conciseness]'
            : allData;

          const sectionPrompt = `Write the "${sectionName}" section for a ${reportLength} formal business report.

REPORT GOAL: ${goal}
${reportFocus ? `FOCUS: ${reportFocus}\n` : ''}

SECTION FOCUS: ${sectionFocus}

LENGTH REQUIREMENT: Maximum ${guideline.maxWords} words. ${guideline.style}

AVAILABLE DATA:
${limitedData}

CRITICAL FORMATTING RULES:
- Write in FLOWING PARAGRAPHS, NEVER use bullet points
- This is a FORMAL BUSINESS REPORT, not casual research notes
- Integrate data and insights naturally into prose
- Use analytical, professional tone
- Weave charts and data into the narrative (if relevant to this section)
- DO NOT exceed ${guideline.maxWords} words`;

          const sectionResponse: any = await callAPIM([
            { role: 'system', content: `You are an expert business analyst writing formal reports. Write in PARAGRAPHS with professional, analytical prose. NEVER use bullet points. Integrate data smoothly into flowing text. Stay under word limit.` },
            { role: 'user', content: sectionPrompt }
          ]);

          artifacts.sections.push({
            name: sectionName,
            content: sectionResponse.choices[0].message.content
          });

          // Emit tool.result event
          await logActivity('tool.result', {
            tool: 'section_drafted',
            section_name: sectionName,
            word_count: sectionResponse.choices[0].message.content.split(/\s+/).length
          });
          break;

        case 'compile_report':
          // This will be handled in PHASE 3
          break;
      }

      stepNumber++;
      
      } catch (toolError: any) {
        console.error(`[Reports] ❌ Tool execution failed: ${toolCall.tool}`, toolError);
        // Log failure but continue with other tools
        await logActivity('tool.result', {
          tool: toolCall.tool,
          success: false,
          error: toolError.message
        });
        stepNumber++;
        // Continue to next tool instead of failing entire report
      }
    }

    // PHASE 3: Compile final report
    console.log('[Reports] PHASE 3: Compiling final report...');
    await updateProgress(stepNumber, totalSteps, 'Compiling final report...');

    // Generate title from content using APIM
    let reportTitle = goal; // Default to goal
    try {
      const titlePrompt = `Generate a professional, formal title for this business report (maximum 12 words). 
      
Report subject: ${plan.understanding.coreSubject}
Report type: ${plan.understanding.reportType}
Goal: ${goal}

Return ONLY the title, nothing else.`;
      
      const titleResponse: any = await callAPIM([
        { role: 'system', content: 'You are a professional business analyst. Generate concise, formal report titles.' },
        { role: 'user', content: titlePrompt }
      ]);
      
      const generatedTitle = titleResponse.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
      if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length < 150) {
        reportTitle = generatedTitle;
      }
    } catch (titleError) {
      console.log('[Reports] ⚠️  Title generation failed, using goal as title');
    }

    let finalReport = `# ${reportTitle}\n\n`;

    // Add sections
    for (const section of artifacts.sections) {
      finalReport += `## ${section.name}\n\n`;
      finalReport += `${section.content}\n\n`;
    }

    // Add charts inline (place at end for now, TODO: integrate with sections)
    if (artifacts.charts.length > 0) {
      finalReport += `## Data Visualizations\n\n`;
      for (const chart of artifacts.charts) {
        finalReport += `### ${chart.purpose || chart.type}\n\n`;
        if (chart.failed) {
          finalReport += `*Chart generation failed (${chart.type})*\n\n`;
        } else {
          finalReport += `![${chart.type} chart](${chart.url})\n\n`;
        }
      }
    }

    // Log completion activity for polling
    await logActivity('report.complete', {
      report: finalReport,
      sections_count: artifacts.sections.length,
      charts_count: artifacts.charts.length,
      findings_count: artifacts.webFindings.length
    });

    // Save completed report
    await dbQuery(
      `UPDATE o1_research_runs
       SET status = 'completed',
           report_content = $2,
           metadata = jsonb_set(metadata, '{completed_at}', to_jsonb($3::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, finalReport, new Date().toISOString()]
    );

    console.log('[Reports] ✅ Report completed:', runId);
    clearTimeout(timeout); // Clear timeout on success

  } catch (error: any) {
    console.error('[Reports] Generation error:', error);
    clearTimeout(timeout); // Clear timeout on error

    await dbQuery(
      `UPDATE o1_research_runs
       SET status = 'failed',
           metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, error.message]
    );
  }
}

/**
 * POST /reports/:runId/chat
 * Follow-up conversational chat about a completed report
 */
router.post('/:runId/chat', async (req, res) => {
  try {
    const { runId } = req.params;
    const { message, chatHistory } = req.body;
    const userId = req.auth?.sub as string;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[Reports Chat] Follow-up question:', { runId, userId, message: message.substring(0, 100), historyLength: chatHistory?.length || 0 });

    // Retrieve the report run
    const result = await dbQuery(
      `SELECT id, user_id, query, report_content, status, metadata
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report run not found' });
    }

    const run = result.rows[0];

    if (run.status !== 'completed') {
      return res.status(400).json({ error: 'Report is not yet completed. Please wait for the report to finish.' });
    }

    if (!run.report_content || run.report_content.trim().length === 0) {
      return res.status(400).json({ error: 'No report content available.' });
    }

    // Build context for APIM
    const reportMetadata = run.metadata || {};
    const reportGoal = reportMetadata.goal || run.query;
    const reportContext = `REPORT (Generated for goal: "${reportGoal}"):\n\n${run.report_content}`;

    const systemPrompt = `You are a helpful business analyst assistant. The user has a comprehensive report and is asking follow-up questions about it.

REPORT CONTEXT:
${reportContext}

YOUR JOB:
- Answer questions BASED ON THE REPORT CONTENT
- Maintain conversation context from previous messages
- Be conversational and professional
- Reference specific sections/findings from the report
- If asked something not in the report, acknowledge limitations

CRITICAL:
- DO NOT make up information
- Keep responses focused and concise`;

    // Build message array with conversation history
    const messages: Array<{role: string; content: string}> = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history if provided
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    console.log('[Reports Chat] Calling APIM with', messages.length, 'messages...');

    // Call APIM for conversational response
    const response = await callAPIM(messages);

    const answer = response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    console.log('[Reports Chat] ✅ Follow-up answer generated');

    return res.json({
      success: true,
      answer
    });

  } catch (error: any) {
    console.error('[Reports Chat] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /reports/:runId/regenerate
 * Regenerate report based on feedback/modifications
 */
router.post('/:runId/regenerate', async (req, res) => {
  try {
    const { runId } = req.params;
    const { feedback } = req.body;
    const userId = req.auth?.sub as string;

    // ✅ Feedback is optional - if not provided, regenerate with original goal
    const feedbackText = (feedback && typeof feedback === 'string') ? feedback.trim() : '';

    console.log('[Reports Regenerate] Regenerating:', { 
      runId, 
      userId, 
      hasFeedback: feedbackText.length > 0,
      feedback: feedbackText ? feedbackText.substring(0, 100) : '(no feedback - regenerating original)' 
    });

    // Retrieve the original report run
    const result = await dbQuery(
      `SELECT id, user_id, query, report_content, status, metadata, depth, uploaded_files
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report run not found' });
    }

    const originalRun = result.rows[0];

    if (originalRun.status !== 'completed') {
      return res.status(400).json({ error: 'Cannot regenerate - original report is not yet completed.' });
    }

    if (!originalRun.report_content || originalRun.report_content.trim().length === 0) {
      return res.status(400).json({ error: 'No report content available to regenerate from.' });
    }

    // Create a new run for the regenerated report
    const newRunId = `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const originalMetadata = originalRun.metadata || {};
    
    await dbQuery(
      `INSERT INTO o1_research_runs (
        id, user_id, query, depth, status, 
        uploaded_files, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        newRunId,
        userId,
        originalRun.query,
        originalRun.depth || 'medium',
        'running',
        originalRun.uploaded_files || '[]',
        JSON.stringify({
          ...originalMetadata,
          regenerated_from: runId,
          feedback: feedbackText || null, // ✅ Store feedback (may be null)
          original_report: originalRun.report_content.substring(0, 10000), // ✅ Store original report
          started_at: new Date().toISOString()
        })
      ]
    );

    console.log('[Reports Regenerate] Created new run:', newRunId);

    // ✅ REBUILD: Use same generateReportAsync flow with ORIGINAL goal
    // Stream will detect regeneration from metadata and inject context
    const uploadedFiles = JSON.parse(originalRun.uploaded_files || '[]');
    const reportLength = originalMetadata.reportLength || originalRun.depth || 'medium';
    const reportFocus = originalMetadata.reportFocus || 'comprehensive';
    const selectedCharts = originalMetadata.selectedCharts || [];

    setImmediate(() => {
      generateReportAsync(
        newRunId,
        userId,
        originalMetadata.orgId || '00000000-0000-0000-0000-000000000001',
        originalMetadata.goal || originalRun.query, // ✅ UNCHANGED original goal
        reportLength,
        reportFocus,
        selectedCharts,
        uploadedFiles
      ).catch((error) => {
        console.error('[Reports Regenerate] Background processing error:', error);
        dbQuery(
          `UPDATE o1_research_runs 
           SET status = 'failed', 
               metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text))
           WHERE id = $1`,
          [newRunId, error.message]
        );
      });
    });

    return res.json({
      success: true,
      run_id: newRunId,
      status: 'running',
      message: 'Report regeneration started'
    });

  } catch (error: any) {
    console.error('[Reports Regenerate] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to start regeneration',
      details: error.message 
    });
  }
});

export default router;

