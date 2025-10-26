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

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// ============================================================================
// Types
// ============================================================================

interface ResearchStartRequest {
  query: string;
  uploaded_files?: string[];
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
    // PHASE 2: REAL RESEARCH EXECUTION
    // ========================================================================
    
    const startTime = Date.now();
    console.log('[Research] Starting real research execution...');
    
    // Track all findings
    const allFindings: string[] = [];
    const sources: string[] = [];
    
    // Initial thinking
    emit('thinking', {
      thought: 'Starting research analysis...',
      thought_type: 'planning'
    });
    
    emit('thinking', {
      thought: `Analyzing query: "${run.query.substring(0, 100)}${run.query.length > 100 ? '...' : ''}"`,
      thought_type: 'analyzing'
    });
    
    // Parse uploaded files
    const uploadedFiles = Array.isArray(run.uploaded_files) 
      ? run.uploaded_files 
      : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
    
    // Phase 2A: Process uploaded files (if any)
    // NOTE: Currently Portal doesn't send file content, only IDs
    // File processing will be skipped until Portal integration is updated
    if (uploadedFiles.length > 0) {
      emit('thinking', {
        thought: `Found ${uploadedFiles.length} uploaded file(s) mentioned. Note: File content processing coming soon - proceeding with web research for now.`,
        thought_type: 'planning'
      });
      
      console.log('[Research] Files were uploaded but content not available yet:', uploadedFiles);
      console.log('[Research] TODO: Update Portal to send file content or implement file storage');
      
      // Skip file processing for now, go straight to web search
      emit('thinking', {
        thought: 'Proceeding with external web research to answer your query.',
        thought_type: 'planning'
      });
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
    
    // Phase 2C: Generate report sections
    emit('thinking', {
      thought: `Based on my analysis of ${allFindings.length} findings, I can now create a coherent report with key insights and recommendations.`,
      thought_type: 'synthesis'
    });
    
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
      thought: 'Let me add detailed findings and supporting evidence.',
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
      thought: 'Finalizing the report with actionable recommendations.',
      thought_type: 'final_review'
    });
    
    // Phase 2D: Generate final comprehensive report
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
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Final completion event
    emit('research.completed', {
      run_id: runId,
      report_content: finalReport,
      metadata: {
        word_count: finalReport.split(/\s+/).length,
        duration_seconds: duration,
        phase: 2, // Phase 2: Real research
        files_analyzed: uploadedFiles.length,
        web_sources: sources.length,
        findings_count: allFindings.length,
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
