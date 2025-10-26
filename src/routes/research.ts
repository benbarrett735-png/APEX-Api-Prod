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
 * o1-Style Quality Assessment
 * Evaluates research findings and suggests improvements
 */
async function assessFindingsQuality(findings: string[], query: string): Promise<{
  score: number;
  reasoning: string;
  suggestedQuery?: string;
  shouldExpand: boolean;
}> {
  if (findings.length === 0) {
    return {
      score: 0,
      reasoning: 'No findings collected',
      suggestedQuery: query,
      shouldExpand: true
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
3. Should we search for more/different information?
4. If yes, what refined query would work better?

Respond with ONLY valid JSON:
{
  "score": 1-10,
  "reasoning": "brief explanation",
  "suggested_query": "refined query if needed",
  "should_expand": true/false
}` }
    ];
    
    const response = await callAPIM(messages);
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Quality Assessment] Could not parse APIM response');
      return { score: 7, reasoning: 'Assessment unavailable', shouldExpand: false };
    }
    
    const assessment = JSON.parse(jsonMatch[0]);
    return {
      score: assessment.score || 7,
      reasoning: assessment.reasoning || 'Quality assessment complete',
      suggestedQuery: assessment.suggested_query,
      shouldExpand: assessment.should_expand || false
    };
  } catch (error: any) {
    console.error('[Quality Assessment] Error:', error);
    return { score: 7, reasoning: 'Assessment failed, proceeding', shouldExpand: false };
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
  files: string[],
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
    // PHASE 2: DYNAMIC RESEARCH EXECUTION
    // ========================================================================
    
    const startTime = Date.now();
    console.log('[Research] Starting dynamic research execution...');
    
    // Track all findings
    const allFindings: string[] = [];
    const sources: string[] = [];
    
    // Parse uploaded files and chart requests
    const uploadedFiles = Array.isArray(run.uploaded_files) 
      ? run.uploaded_files 
      : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
    
    const includeCharts = Array.isArray(run.include_charts)
      ? run.include_charts
      : (run.include_charts ? JSON.parse(run.include_charts) : []);
    
    // Initial analysis - determine research strategy
    emit('thinking', {
      thought: 'Analyzing your query to determine the best research approach...',
      thought_type: 'planning'
    });
    
    // Analyze query complexity and type
    const queryLower = run.query.toLowerCase();
    const hasComparison = queryLower.includes('compare') || queryLower.includes('vs') || queryLower.includes('versus');
    const hasTimeline = queryLower.includes('history') || queryLower.includes('timeline') || queryLower.includes('evolution');
    const hasAnalysis = queryLower.includes('analyze') || queryLower.includes('breakdown') || queryLower.includes('evaluate');
    const hasData = queryLower.includes('data') || queryLower.includes('statistics') || queryLower.includes('metrics');
    
    // Determine research depth dynamically
    let estimatedSteps = 5; // Base
    if (run.depth === 'comprehensive') estimatedSteps = 12;
    else if (run.depth === 'long') estimatedSteps = 9;
    else if (run.depth === 'medium') estimatedSteps = 7;
    else estimatedSteps = 5;
    
    // Adjust based on query type and features
    if (hasComparison) estimatedSteps += 2;
    if (hasTimeline) estimatedSteps += 2;
    if (hasAnalysis) estimatedSteps += 1;
    if (uploadedFiles.length > 0) estimatedSteps += 2;
    if (includeCharts.length > 0) estimatedSteps += includeCharts.length; // Each chart adds a step
    
    emit('thinking', {
      thought: `Query type: ${hasComparison ? 'Comparative analysis' : hasTimeline ? 'Historical research' : hasAnalysis ? 'Deep analysis' : 'Informational research'}. Planning ${estimatedSteps} research steps.`,
      thought_type: 'planning'
    });
    
    // Phase 2A: Process uploaded files (if any)
    if (uploadedFiles.length > 0) {
      emit('thinking', {
        thought: `Analyzing ${uploadedFiles.length} uploaded document${uploadedFiles.length > 1 ? 's' : ''}...`,
        thought_type: 'analyzing'
      });
      
      // Check if files have content (ADI-extracted)
      const filesWithContent = uploadedFiles.filter((f: any) => f.content && f.content.trim().length > 0) as UploadedFile[];
      
      if (filesWithContent.length > 0) {
        emit('tool.call', {
          tool: 'document_analysis',
          purpose: `Analyze ${filesWithContent.length} uploaded document${filesWithContent.length > 1 ? 's' : ''}`
        });
        
        try {
          // Combine all file contents
          const combinedContent = filesWithContent
            .map((f: UploadedFile) => `### ${f.fileName}\n\n${f.content}`)
            .join('\n\n---\n\n');
          
          console.log(`[Research] Processing ${filesWithContent.length} files with content (${combinedContent.length} chars total)`);
          
          // Use APIM to extract key findings from documents
          const documentAnalysis = await generateSectionSummary(
            'Document Analysis', 
            [`Extracted content from ${filesWithContent.length} document(s):\n\n${combinedContent.substring(0, 8000)}`]
          );
          
          // Extract findings from analysis
          const documentFindings = documentAnalysis
            .split('\n')
            .filter(line => line.trim().length > 20 && !line.startsWith('#'))
            .map(line => `[From Uploaded Documents] ${line.trim()}`)
            .slice(0, 10); // Top 10 findings from documents
          
          allFindings.push(...documentFindings);
          sources.push(...filesWithContent.map((f: UploadedFile) => `Uploaded: ${f.fileName}`));
          
          emit('tool.result', {
            tool: 'document_analysis',
            findings_count: documentFindings.length,
            key_insights: `Extracted ${documentFindings.length} key insights from uploaded documents`
          });
          
          emit('thinking', {
            thought: `Extracted ${documentFindings.length} key findings from your uploaded documents. Let me complement this with external research.`,
            thought_type: 'analyzing'
    });
  } catch (error: any) {
          console.error('[Research] Document analysis error:', error);
          emit('tool.result', {
            tool: 'document_analysis',
            findings_count: 0,
            key_insights: `Analysis failed: ${error.message}. Proceeding with web research.`
          });
        }
      } else {
        console.warn('[Research] Files uploaded but no content provided');
        emit('thinking', {
          thought: 'Files uploaded but content not available yet. Proceeding with web research.',
          thought_type: 'planning'
        });
      }
    } else {
      emit('thinking', {
        thought: 'No uploaded files. I\'ll search for external information to answer this query.',
        thought_type: 'planning'
      });
    }
    
    // Phase 2B: External web search using OpenAI
    if (isOpenAIConfigured()) {
      emit('tool.call', {
        tool: 'openai_search',
        purpose: 'Search public web for relevant information'
      });
      
      try {
        const searchResult = await searchWeb(run.query);
        
        allFindings.push(...searchResult.findings);
        sources.push(...searchResult.sources);
        
        emit('tool.result', {
          tool: 'openai_search',
          findings_count: searchResult.findings.length,
          key_insights: searchResult.summary
        });
        
        // Phase 3: o1-Style Self-Critique
        emit('thinking', {
          thought: 'Evaluating quality of research findings...',
          thought_type: 'self_critique'
        });
        
        const qualityCheck = await assessFindingsQuality(allFindings, run.query);
        
        if (qualityCheck.score < 6 && qualityCheck.shouldExpand) {
          emit('thinking', {
            thought: `Research quality: ${qualityCheck.score}/10. ${qualityCheck.reasoning}. Let me try a different approach...`,
            thought_type: 'self_critique'
          });
          
          emit('thinking', {
            thought: `Pivoting strategy: Using more specific search terms to improve results.`,
            thought_type: 'pivot'
          });
          
          // Pivot: Try refined search
          try {
            const refinedQuery = qualityCheck.suggestedQuery || run.query;
            
            emit('tool.call', {
              tool: 'openai_search_refined',
              purpose: `Refined search with better query: "${refinedQuery.substring(0, 50)}..."`
            });
            
            const refinedSearch = await searchWeb(refinedQuery);
            allFindings.push(...refinedSearch.findings);
            sources.push(...refinedSearch.sources);
            
            emit('tool.result', {
              tool: 'openai_search_refined',
              findings_count: refinedSearch.findings.length,
              key_insights: `Refined search found ${refinedSearch.findings.length} additional items`
            });
            
            console.log(`[Research] Refined search complete: ${refinedSearch.findings.length} additional findings`);
          } catch (error: any) {
            console.error('[Research] Refined search error:', error);
          }
        } else {
          emit('thinking', {
            thought: `Quality check: ${qualityCheck.score}/10. ${qualityCheck.reasoning}. Proceeding to synthesis.`,
            thought_type: 'self_critique'
          });
        }
        
      } catch (error: any) {
        console.error('[Research] OpenAI search error:', error);
        emit('thinking', {
          thought: `External search encountered an issue: ${error.message}. Using available findings.`,
          thought_type: 'pivot'
        });
      }
    } else {
      console.warn('[Research] OpenAI not configured, skipping web search');
      emit('thinking', {
        thought: 'External search not available. Proceeding with available data.',
        thought_type: 'planning'
      });
    }
    
    // Phase 2C: Generate report sections (dynamic based on findings)
    emit('thinking', {
      thought: `Synthesizing ${allFindings.length} findings from ${sources.length} sources into a comprehensive report...`,
      thought_type: 'synthesis'
    });
    
    // Determine sections based on query type
    const sections: string[] = ['Executive Summary', 'Key Findings'];
    if (hasComparison) sections.push('Comparative Analysis');
    if (hasTimeline) sections.push('Historical Context');
    if (hasAnalysis) sections.push('Detailed Analysis');
    if (hasData) sections.push('Data & Metrics');
    sections.push('Recommendations', 'Conclusion');
    
    // Generate Executive Summary (with error handling)
    let execSummary = 'Analysis of research findings';
    try {
      if (allFindings.length > 0) {
        execSummary = await generateSectionSummary('Executive Summary', allFindings.slice(0, 3));
      }
    } catch (error: any) {
      console.error('[Research] Executive summary generation error:', error);
      execSummary = `Research on "${run.query}" with ${allFindings.length} findings from ${sources.length} sources.`;
    }
    
    emit('section.completed', {
      section: 'Executive Summary',
      preview: execSummary.substring(0, 200) + (execSummary.length > 200 ? '...' : '')
    });
    
    emit('thinking', {
      thought: `Building ${sections.length} sections based on your query type and the findings collected.`,
      thought_type: 'writing'
    });
    
    // Generate Key Findings preview
    const keyFindingsPreview = allFindings.length > 0
      ? allFindings.slice(0, 5).map((f, i) => `${i + 1}. ${f.substring(0, 80)}${f.length > 80 ? '...' : ''}`).join('\n')
      : '1. Research findings being compiled...';
    
    emit('section.completed', {
      section: 'Key Findings',
      preview: keyFindingsPreview
    });
    
    emit('thinking', {
      thought: 'Finalizing with recommendations and actionable insights.',
      thought_type: 'final_review'
    });
    
    // Phase 2D: Generate charts (if requested)
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
    
    // Phase 2E: Generate final comprehensive report
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

${execSummary}

## Key Findings

${allFindings.map((f, i) => `${i + 1}. ${f}`).join('\n\n')}

## Analysis

The research covered ${allFindings.length} key findings from ${sources.length} sources related to: "${run.query}"

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
        phase: 2, // Phase 2: Real research with charts
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
