/**
 * Research API Routes - o1-Style Continuous Reasoning
 * Phase 2: Real APIM reasoning, OpenAI search, file processing
 * 
 * Per Kevin's plan: All business logic stays in API
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchWeb, isOpenAIConfigured } from '../services/openaiSearch.js';
import { getMultipleFiles, combineFileContents } from '../services/fileRetrieval.js';
import { generateReport, generateSectionSummary } from '../services/reportGenerator.js';
import { ChartService } from '../services/chartService.js';
import { callAPIM } from '../services/agenticFlow.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * o1-Style Dynamic Plan Creation
 * Creates a real execution plan that will be followed step-by-step
 */
async function createResearchPlan(
  query: string,
  depth: string,
  hasFiles: boolean,
  includeCharts: string[]
): Promise<{ steps: string[]; reasoning: string }> {
  try {
    const messages = [
      { 
        role: 'system', 
        content: 'You are a research planner. Create a specific step-by-step research plan. Each step must be a concrete action, not vague.' 
      },
      { 
        role: 'user', 
        content: `Query: "${query}"
Depth: ${depth}
Has uploaded files: ${hasFiles}
Requested charts: ${includeCharts.length > 0 ? includeCharts.join(', ') : 'none'}

Create a research plan with specific steps. Available actions:
- "analyze_files": Extract insights from uploaded documents
- "search_web": Search external sources for information
- "search_web_refined": Do a more specific follow-up search
- "synthesize": Combine findings into coherent analysis
- "generate_chart": Create a specific chart (specify type)
- "quality_check": Evaluate if we have enough information
- "write_report": Generate final report

Rules:
1. Always start with the most relevant data source (files first if available)
2. Do quality checks after gathering data
3. Only search web if needed (not always required)
4. Chart generation comes after data collection
5. Report writing is always last

Respond with ONLY valid JSON:
{
  "steps": ["step 1 description", "step 2 description", ...],
  "reasoning": "why this plan makes sense"
}

Example for "Compare React vs Vue" with no files:
{
  "steps": [
    "search_web: Find current state of React framework",
    "search_web: Find current state of Vue framework",
    "quality_check: Verify we have balanced information on both",
    "synthesize: Compare features, performance, ecosystem",
    "write_report: Create comparative analysis"
  ],
  "reasoning": "Comparison requires balanced information from both frameworks"
}`
      }
    ];
    
    const response = await callAPIM(messages);
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Plan Creation] Could not parse APIM response, using default plan');
      return {
        steps: hasFiles 
          ? ['analyze_files', 'search_web', 'synthesize', 'write_report']
          : ['search_web', 'synthesize', 'write_report'],
        reasoning: 'Default plan due to parsing error'
      };
    }
    
    const plan = JSON.parse(jsonMatch[0]);
    return {
      steps: plan.steps || [],
      reasoning: plan.reasoning || 'Research plan created'
    };
  } catch (error: any) {
    console.error('[Plan Creation] Error:', error);
    // Fallback plan
    return {
      steps: hasFiles 
        ? ['analyze_files', 'search_web', 'synthesize', 'write_report']
        : ['search_web', 'synthesize', 'write_report'],
      reasoning: 'Fallback plan due to error'
    };
  }
}

/**
 * o1-Style Quality Assessment
 * Evaluates research findings and suggests next action
 */
async function assessFindingsQuality(findings: string[], query: string): Promise<{
  score: number;
  reasoning: string;
  nextAction?: string;
  shouldContinue: boolean;
}> {
  if (findings.length === 0) {
    return {
      score: 0,
      reasoning: 'No findings collected',
      nextAction: 'search_web',
      shouldContinue: true
    };
  }
  
  try {
    const messages = [
      { role: 'system', content: 'You are a research quality evaluator. Assess if findings adequately answer the query.' },
      { role: 'user', content: `Query: "${query}"

Findings (${findings.length} total):
${findings.slice(0, 5).map((f, i) => `${i + 1}. ${f.substring(0, 200)}...`).join('\n\n')}

Evaluate:
1. Do these findings answer the query comprehensively?
2. Quality score (1-10)
3. What should we do next? (continue_plan, search_more, or finish)

Respond with ONLY valid JSON:
{
  "score": 1-10,
  "reasoning": "brief explanation",
  "next_action": "continue_plan or search_web_refined or finish",
  "should_continue": true/false
}` }
    ];
    
    const response = await callAPIM(messages);
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Quality Assessment] Could not parse APIM response');
      return { score: 7, reasoning: 'Assessment unavailable', shouldContinue: true };
    }
    
    const assessment = JSON.parse(jsonMatch[0]);
    return {
      score: assessment.score || 7,
      reasoning: assessment.reasoning || 'Quality assessment complete',
      nextAction: assessment.next_action,
      shouldContinue: assessment.should_continue !== false
    };
  } catch (error: any) {
    console.error('[Quality Assessment] Error:', error);
    return { score: 7, reasoning: 'Assessment failed, proceeding', shouldContinue: true };
  }
}

// ============================================================================
// Types
// ============================================================================

interface UploadedFile {
  uploadId: string;
  fileName: string;
  content?: string; // ADI-extracted text
}

interface ResearchStartRequest {
  query: string;
  uploaded_files?: string[] | UploadedFile[]; // Can be string IDs or full objects with content
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  include_charts?: string[];
  target_sources?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `run_${timestamp}_${random}`;
}

/**
 * Sleep utility for phased event emission
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure user exists in database (auto-create from JWT)
 */
async function ensureUser(userId: string, email?: string, orgId?: string) {
  try {
    // Ensure org exists first
    const defaultOrgId = orgId || '00000000-0000-0000-0000-000000000001';
    const orgCheck = await dbQuery('SELECT id FROM orgs WHERE id = $1', [defaultOrgId]);
    
    if (orgCheck.rows.length === 0) {
      console.log('[Research] Auto-creating org:', defaultOrgId);
      await dbQuery(
        `INSERT INTO orgs (id, name, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [defaultOrgId, 'Default Organization']
      );
    }
    
    // Check if user exists
    const userCheck = await dbQuery('SELECT id FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      console.log('[Research] Auto-creating user:', userId, email);
      await dbQuery(
        `INSERT INTO users (id, org_id, email, role, external_sub, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userId, defaultOrgId, email || `${userId}@cognito.local`, 'member', userId]
      );
    }
  } catch (error) {
    console.error('[Research] Error ensuring user:', error);
    throw error;
  }
}

// ============================================================================
// PHASE 1: Background Processing (Hardcoded for now)
// ============================================================================

/**
 * Background research processor
 * Phase 2: Real research execution (runs async from SSE stream)
 */
async function processResearch(
  runId: string,
  query: string,
  files: string[] | UploadedFile[],
  depth: string
): Promise<void> {
  console.log(`[Research] Background processing started for ${runId}`);
  console.log(`[Research] Query: "${query}", Depth: ${depth}, Files: ${files.length}`);
  
  // Update status to processing
  await dbQuery(
    `UPDATE o1_research_runs 
     SET status = 'processing', updated_at = NOW()
     WHERE id = $1`,
    [runId]
  );
  
  // Note: SSE stream handles the actual research
  // This background task just ensures DB status is updated
  // Real work happens in the SSE stream to emit events in real-time
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /research/start
 * Create a new research run and start processing
 */
router.post('/start', async (req, res) => {
  try {
    const {
      query,
      uploaded_files = [],
      depth = 'medium',
      include_charts = [],
      target_sources = []
    }: ResearchStartRequest = req.body;
    
    // Debug logging for file upload issue
    console.log('[Research] POST /start received:');
    console.log('  Query:', query?.substring(0, 100));
    console.log('  Depth:', depth);
    console.log('  uploaded_files type:', typeof uploaded_files);
    console.log('  uploaded_files is array:', Array.isArray(uploaded_files));
    console.log('  uploaded_files length:', uploaded_files?.length || 0);
    if (uploaded_files && uploaded_files.length > 0) {
      console.log('  First file:', JSON.stringify(uploaded_files[0], null, 2));
    }
    
    // Extract user from validated JWT
    const userId = req.auth?.sub as string;
    const email = req.auth?.email as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    // Validate request
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!['short', 'medium', 'long', 'comprehensive'].includes(depth)) {
      return res.status(400).json({ error: 'Invalid depth value' });
    }
    
    // Ensure user exists
    await ensureUser(userId, email);

    // Generate run ID
    const runId = generateRunId();
    
    console.log('[Research] Starting new run:', {
      runId,
      userId,
      query: query.substring(0, 100),
      depth,
      filesCount: uploaded_files.length
    });
    
    // Create run in database
    await dbQuery(
      `INSERT INTO o1_research_runs (
        id, user_id, query, depth, status, 
        uploaded_files, include_charts, target_sources, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        runId,
        userId,
        query,
        depth,
        'planning',
        JSON.stringify(uploaded_files),
        JSON.stringify(include_charts),
        JSON.stringify(target_sources),
        JSON.stringify({
          started_at: new Date().toISOString(),
          phase: 1 // Phase 1: Hardcoded events
        })
      ]
    );
    
    // Start background processing (async, don't await)
    setImmediate(() => {
      processResearch(runId, query, uploaded_files, depth).catch((error) => {
        console.error('[Research] Background processing error:', error);
        // Update run status to failed
        dbQuery(
          `UPDATE o1_research_runs 
           SET status = 'failed', 
               metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text)),
               updated_at = NOW()
           WHERE id = $1`,
          [runId, error.message]
        ).catch(err => console.error('[Research] Failed to update error status:', err));
      });
    });
    
    // Return immediately
    return res.json({
      run_id: runId,
      status: 'planning',
      stream_url: `/research/stream/${runId}`
    });
    
  } catch (error: any) {
    console.error('[Research] Start error:', error);
    return res.status(500).json({ 
      error: 'Failed to start research',
      message: error.message 
    });
  }
});

/**
 * GET /research/stream/:id
 * SSE stream of research events (thinking, tool calls, results, completion)
 */
router.get('/stream/:id', async (req, res) => {
  try {
    const runId = req.params.id;
    const userId = req.auth?.sub as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    console.log('[Research] Stream requested:', { runId, userId });
    
    // Verify run exists and belongs to user
    const result = await dbQuery(
      `SELECT id, user_id, query, status, uploaded_files, depth
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research run not found' });
    }

    const run = result.rows[0];

    // Set SSE headers (CRITICAL for streaming)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    // Helper to emit SSE events
    const emit = (event: string, data: any) => {
      // SSE format: event: <type>\ndata: <json>\n\n
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    
    // ========================================================================
    // PHASE 3: TRUE DYNAMIC PLANNING + EXECUTION (o1-Style)
    // ========================================================================
    
    const startTime = Date.now();
    console.log('[Research] Starting o1-style research with dynamic planning...');
    
    // Track all findings
    const allFindings: string[] = [];
    const sources: string[] = [];
    let documentAnalysisResult: string | null = null;
    
    // Parse uploaded files and chart requests
    console.log('[Research] Raw uploaded_files from DB:', typeof run.uploaded_files, run.uploaded_files);
    const uploadedFiles: UploadedFile[] = Array.isArray(run.uploaded_files) 
      ? run.uploaded_files 
      : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
    console.log('[Research] Parsed uploadedFiles:', uploadedFiles.length, 'files');
    if (uploadedFiles.length > 0) {
      console.log('[Research] First file:', {
        hasUploadId: !!uploadedFiles[0]?.uploadId,
        hasFileName: !!uploadedFiles[0]?.fileName,
        hasContent: !!uploadedFiles[0]?.content,
        contentLength: uploadedFiles[0]?.content?.length || 0
      });
    }
    
    const includeCharts: string[] = Array.isArray(run.include_charts)
      ? run.include_charts
      : (run.include_charts ? JSON.parse(run.include_charts) : []);
    
    // Step 1: Create Dynamic Research Plan using APIM
    emit('thinking', {
      thought: 'Analyzing your query to create a tailored research plan...',
      thought_type: 'planning'
    });
    
    const researchPlan = await createResearchPlan(
      run.query,
      run.depth,
      uploadedFiles.length > 0,
      includeCharts
    );
    
    console.log('[Research] Plan created:', researchPlan);
    
    // Show the plan to the user
    emit('thinking', {
      thought: `Research plan: ${researchPlan.steps.length} steps. ${researchPlan.reasoning}`,
      thought_type: 'planning'
    });
    
    emit('thinking', {
      thought: `Steps: ${researchPlan.steps.map((s, i) => `\n${i + 1}. ${s}`).join('')}`,
      thought_type: 'planning'
    });
    
    // Step 2: Execute the plan step-by-step
    for (let i = 0; i < researchPlan.steps.length; i++) {
      const step = researchPlan.steps[i];
      console.log(`[Research] Executing step ${i + 1}/${researchPlan.steps.length}: ${step}`);
      
      emit('thinking', {
        thought: `Step ${i + 1}/${researchPlan.steps.length}: ${step}`,
        thought_type: 'executing'
      });
      
      // Parse step action (format: "action: description")
      const colonIndex = step.indexOf(':');
      const action = colonIndex > 0 ? step.substring(0, colonIndex).trim().toLowerCase() : step.toLowerCase();
      const description = colonIndex > 0 ? step.substring(colonIndex + 1).trim() : step;
      
      try {
        // Execute based on action type
        if (action.includes('analyze_file') || action.includes('analyze_document')) {
          // File analysis
          const filesWithContent = uploadedFiles.filter((f: any) => f.content && f.content.trim().length > 0) as UploadedFile[];
          
          if (filesWithContent.length > 0) {
            emit('tool.call', {
              tool: 'document_analysis',
              purpose: description || `Analyze ${filesWithContent.length} uploaded document${filesWithContent.length > 1 ? 's' : ''}`
            });
            
            try {
              const combinedContent = filesWithContent
                .map((f: UploadedFile) => `### ${f.fileName}\n\n${f.content}`)
                .join('\n\n---\n\n');
              
              console.log(`[Research] Processing ${filesWithContent.length} files with content (${combinedContent.length} chars total)`);
              
              documentAnalysisResult = await generateSectionSummary(
                'Document Analysis', 
                [`Extracted content from ${filesWithContent.length} document(s):\n\n${combinedContent.substring(0, 8000)}`]
              );
              
              const documentFindings = documentAnalysisResult
                .split('\n')
                .filter(line => line.trim().length > 20 && !line.startsWith('#'))
                .map(line => `[From Uploaded Documents] ${line.trim()}`)
                .slice(0, 10);
              
              allFindings.push(...documentFindings);
              sources.push(...filesWithContent.map((f: UploadedFile) => `Uploaded: ${f.fileName}`));
              
              emit('tool.result', {
                tool: 'document_analysis',
                findings_count: documentFindings.length,
                key_insights: `Extracted ${documentFindings.length} key insights from uploaded documents`
              });
  } catch (error: any) {
              console.error('[Research] Document analysis error:', error);
              emit('tool.result', {
                tool: 'document_analysis',
                findings_count: 0,
                key_insights: `Analysis failed: ${error.message}`
              });
            }
          } else {
            emit('thinking', {
              thought: 'Files uploaded but content not available. Skipping this step.',
              thought_type: 'pivot'
            });
          }
          
        } else if (action.includes('search_web')) {
          // Web search
          if (isOpenAIConfigured()) {
            const isRefined = action.includes('refined');
            const toolName = isRefined ? 'openai_search_refined' : 'openai_search';
            
            emit('tool.call', {
              tool: toolName,
              purpose: description || 'Search public web for relevant information'
            });
            
            try {
              const searchResult = await searchWeb(run.query);
              
              allFindings.push(...searchResult.findings);
              sources.push(...searchResult.sources);
              
              emit('tool.result', {
                tool: toolName,
                findings_count: searchResult.findings.length,
                key_insights: searchResult.summary
    });
  } catch (error: any) {
              console.error('[Research] Web search error:', error);
              emit('tool.result', {
                tool: toolName,
                findings_count: 0,
                key_insights: `Search failed: ${error.message}`
              });
            }
          } else {
            emit('thinking', {
              thought: 'External search not available. Skipping this step.',
              thought_type: 'pivot'
            });
          }
          
        } else if (action.includes('quality_check') || action.includes('evaluate')) {
          // Quality assessment
          emit('thinking', {
            thought: 'Evaluating quality of research findings...',
            thought_type: 'self_critique'
          });
          
          try {
            const qualityCheck = await assessFindingsQuality(allFindings, run.query);
            
            emit('thinking', {
              thought: `Quality check: ${qualityCheck.score}/10. ${qualityCheck.reasoning}`,
              thought_type: 'self_critique'
            });
            
            // If quality is low and suggests more search, add to plan
            if (qualityCheck.score < 6 && qualityCheck.nextAction === 'search_web_refined') {
              emit('thinking', {
                thought: 'Quality insufficient. Adding refined search to plan...',
                thought_type: 'pivot'
              });
              
              researchPlan.steps.splice(i + 1, 0, 'search_web_refined: Search with more specific terms');
              console.log('[Research] Plan adjusted: Added refined search step');
            }
          } catch (error: any) {
            console.error('[Research] Quality check error:', error);
          }
          
        } else if (action.includes('synthesize') || action.includes('combine')) {
          // Synthesis step
          emit('thinking', {
            thought: `Synthesizing ${allFindings.length} findings from ${sources.length} sources...`,
            thought_type: 'synthesis'
          });
          
        } else if (action.includes('generate_chart') || action.includes('chart')) {
          // Chart generation (handled later in batch)
          emit('thinking', {
            thought: `Chart generation scheduled: ${description}`,
            thought_type: 'planning'
          });
          
        } else if (action.includes('write_report') || action.includes('final')) {
          // Report writing (handled at the end)
          emit('thinking', {
            thought: 'Preparing final report with all findings...',
            thought_type: 'writing'
          });
          
        } else {
          // Unknown step - just acknowledge it
          emit('thinking', {
            thought: `Executing: ${step}`,
            thought_type: 'executing'
          });
        }
        
      } catch (error: any) {
        console.error(`[Research] Error executing step "${step}":`, error);
        emit('thinking', {
          thought: `Step encountered an issue: ${error.message}. Continuing with next step.`,
          thought_type: 'pivot'
        });
      }
    }
    
    // Step 3: Generate charts (if requested)
    emit('thinking', {
      thought: 'Plan execution complete. Generating outputs...',
      thought_type: 'synthesis'
    });
    const chartUrls: Record<string, string> = {};
    
    if (includeCharts.length > 0 && allFindings.length > 0) {
      emit('thinking', {
        thought: `Generating ${includeCharts.length} chart${includeCharts.length > 1 ? 's' : ''} to visualize research findings...`,
        thought_type: 'synthesis'
      });
      
      const chartService = new ChartService();
      
      for (const chartType of includeCharts) {
        try {
          emit('tool.call', {
            tool: 'chart_generator',
            purpose: `Generate ${chartType} chart from research data`
          });
          
          // Extract chart-worthy data from findings
          const chartData = {
            data: allFindings.join('\n'),
            chartType: chartType as any,
            title: `${run.query} - ${chartType} visualization`,
            goal: `Create a ${chartType} chart that visualizes the key insights from this research: "${run.query}". Extract relevant data points, categories, and values from the findings.`
          };
          
          console.log(`[Research] Generating ${chartType} chart...`);
          const chartResult = await chartService.generateChart(chartData);
          
          if (chartResult.success && chartResult.chart_url) {
            chartUrls[chartType] = chartResult.chart_url;
            console.log(`[Research] ${chartType} chart generated: ${chartResult.chart_url}`);
            
            emit('tool.result', {
              tool: 'chart_generator',
              findings_count: 1,
              key_insights: `${chartType} chart generated successfully`
            });
          } else {
            console.warn(`[Research] ${chartType} chart generation failed:`, chartResult.error);
            emit('tool.result', {
              tool: 'chart_generator',
              findings_count: 0,
              key_insights: `${chartType} chart generation failed`
            });
          }
  } catch (error: any) {
          console.error(`[Research] Error generating ${chartType} chart:`, error);
          emit('tool.result', {
            tool: 'chart_generator',
            findings_count: 0,
            key_insights: `Error: ${error.message}`
          });
        }
      }
      
      if (Object.keys(chartUrls).length > 0) {
        emit('thinking', {
          thought: `Successfully generated ${Object.keys(chartUrls).length} chart${Object.keys(chartUrls).length > 1 ? 's' : ''}. Including in final report.`,
          thought_type: 'synthesis'
        });
      }
    }
    
    // Step 4: Generate section previews
    if (allFindings.length > 0) {
      let execSummary = 'Analysis of research findings';
      try {
        execSummary = await generateSectionSummary('Executive Summary', allFindings.slice(0, 3));
      } catch (error: any) {
        console.error('[Research] Executive summary generation error:', error);
        execSummary = `Research on "${run.query}" with ${allFindings.length} findings from ${sources.length} sources.`;
      }
      
      emit('section.completed', {
        section: 'Executive Summary',
        preview: execSummary.substring(0, 200) + (execSummary.length > 200 ? '...' : '')
      });
      
      const keyFindingsPreview = allFindings.slice(0, 5).map((f, i) => `${i + 1}. ${f.substring(0, 80)}${f.length > 80 ? '...' : ''}`).join('\n');
      
      emit('section.completed', {
        section: 'Key Findings',
        preview: keyFindingsPreview
      });
    }
    
    emit('thinking', {
      thought: 'Finalizing report with actionable insights...',
      thought_type: 'final_review'
    });
    
    // Step 5: Generate final comprehensive report
    let finalReport: string;
    
    // If no findings, create simple report
    if (allFindings.length === 0) {
      finalReport = `# Research Report

## Query
"${run.query}"

## Status
Research completed but no specific findings were returned. This may be due to:
- OpenAI API configuration issues
- Query requires more specific parameters
- External search limitations

## Recommendation
Please try rephrasing your query or check API configuration.`;
    } else {
      // Try APIM synthesis with fallback
      try {
        finalReport = await generateReport({
          query: run.query,
          depth: run.depth as any,
          fileFindings: uploadedFiles.length > 0 ? allFindings.filter(f => f.includes('From Uploaded Documents')) : undefined,
          webFindings: allFindings.filter(f => !f.includes('From Uploaded Documents')),
          sources
    });
  } catch (error: any) {
        console.error('[Research] APIM report generation error:', error);
        
        // Create fallback report without APIM
        finalReport = `# Research Report

## Executive Summary

Research on "${run.query}" with ${allFindings.length} findings from ${sources.length} sources.

## Key Findings

${allFindings.map((f, i) => `${i + 1}. ${f}`).join('\n\n')}

## Analysis

The research covered ${allFindings.length} key findings from ${sources.length} sources.

## Sources

${sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Conclusion

This ${run.depth}-depth research provides foundational information on the topic. Further analysis may be needed for specific aspects.

---

*Research completed at ${new Date().toISOString()}*  
*Note: Advanced synthesis temporarily unavailable*`;
      }
      
      // Append charts to report if generated
      if (Object.keys(chartUrls).length > 0) {
        finalReport += `\n\n## Visualizations\n\n`;
        for (const [chartType, chartUrl] of Object.entries(chartUrls)) {
          finalReport += `### ${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart\n\n![${chartType} visualization](${chartUrl})\n\n`;
        }
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Final completion event
    emit('research.completed', {
      run_id: runId,
      report_content: finalReport,
      metadata: {
        word_count: finalReport.split(/\s+/).length,
        duration_seconds: duration,
        phase: 3, // Phase 3: True dynamic planning
        plan_steps: researchPlan.steps.length,
        plan_reasoning: researchPlan.reasoning,
        files_analyzed: uploadedFiles.length,
        web_sources: sources.length,
        findings_count: allFindings.length,
        charts_generated: Object.keys(chartUrls).length,
        chart_types: Object.keys(chartUrls),
        depth: run.depth
      }
    });
    
    // Update database with final report
    await dbQuery(
      `UPDATE o1_research_runs 
       SET status = 'completed',
           report_content = $2,
           metadata = jsonb_set(metadata, '{completed_at}', to_jsonb($3::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, finalReport, new Date().toISOString()]
    );
    
    console.log('[Research] Stream completed:', runId);
    
    // Close SSE connection
    res.end();
    
  } catch (error: any) {
    console.error('[Research] Stream error:', error);
    
    // Emit error event if possible
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ 
        message: 'Stream error occurred',
        error: error.message 
      })}\n\n`);
    } catch (writeError) {
      console.error('[Research] Failed to write error event:', writeError);
    }
    
    res.end();
  }
});

/**
 * GET /research/status/:id
 * Get current status of a research run
 */
router.get('/status/:id', async (req, res) => {
  try {
    const runId = req.params.id;
    const userId = req.auth?.sub as string;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    const result = await dbQuery(
      `SELECT id, status, query, depth, report_content, metadata, created_at, updated_at
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research run not found' });
    }

    const run = result.rows[0];

    res.json({
      run_id: run.id,
      status: run.status,
      query: run.query,
      depth: run.depth,
      has_report: !!run.report_content,
      metadata: run.metadata,
      created_at: run.created_at,
      updated_at: run.updated_at
    });
    
  } catch (error: any) {
    console.error('[Research] Status error:', error);
    res.status(500).json({ error: 'Failed to get research status' });
  }
});

/**
 * GET /research/health
 * Health check for research module
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await dbQuery('SELECT 1');
    
    // Check if o1_research_runs table exists
    const tableCheck = await dbQuery(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'o1_research_runs'
      )`
    );
    
    const tableExists = tableCheck.rows[0]?.exists;

    res.json({
      status: 'ok',
      module: 'research',
      version: '1.0.0',
      phase: 1,
      timestamp: new Date().toISOString(),
      dependencies: {
        database: true,
        research_table: tableExists,
        apim: !!process.env.APIM_HOST,
        openai: !!process.env.OPENAI_API_KEY
      }
    });
  } catch (error: any) {
    console.error('[Research] Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

export default router;
