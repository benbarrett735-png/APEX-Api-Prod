/**
 * Research API Routes - o1-Style Continuous Reasoning
 * Phase 1: Basic SSE streaming with hardcoded events (testing Portal connection)
 * Phase 2+: Will add real APIM reasoning, tool calls, etc.
 * 
 * Per Kevin's plan: All business logic stays in API
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';

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
 * Phase 1: Does nothing (SSE stream handles hardcoded events)
 * Phase 2+: Will contain actual APIM reasoning loop
 */
async function processResearch(
  runId: string,
  query: string,
  files: string[],
  depth: string
): Promise<void> {
  console.log(`[Research] Background processing started for ${runId}`);
  console.log(`[Research] Query: "${query}", Depth: ${depth}, Files: ${files.length}`);
  
  // Phase 1: No-op (SSE stream emits hardcoded events)
  // Phase 2+: This will contain:
  // - APIM reasoning loop
  // - Tool execution
  // - Self-critique
  // - Report generation
  
  // Update status to processing
  await dbQuery(
    `UPDATE o1_research_runs 
     SET status = 'processing', updated_at = NOW()
     WHERE id = $1`,
    [runId]
  );
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
    // PHASE 1: HARDCODED EVENTS (Testing Portal Connection)
    // ========================================================================
    
    console.log('[Research] Emitting hardcoded events for testing...');
    
    // Event 1: Initial thinking
    emit('thinking', {
      thought: 'Starting research analysis...',
      thought_type: 'planning'
    });
    
    await sleep(800);
    
    emit('thinking', {
      thought: `Analyzing query: "${run.query.substring(0, 100)}..."`,
      thought_type: 'analyzing'
    });
    
    await sleep(1000);
    
    // Check if files uploaded
    // Note: pg returns JSONB as parsed objects, not strings
    const uploadedFiles = Array.isArray(run.uploaded_files) 
      ? run.uploaded_files 
      : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
    if (uploadedFiles.length > 0) {
      emit('thinking', {
        thought: `Found ${uploadedFiles.length} uploaded file(s). Let me analyze them first.`,
        thought_type: 'planning'
      });
      
      await sleep(1000);
      
      emit('tool.call', {
        tool: 'apim_process',
        purpose: 'Analyze uploaded documents securely',
        args: { file_count: uploadedFiles.length }
      });
      
      await sleep(2000);
      
      emit('tool.result', {
        tool: 'apim_process',
        findings_count: 5,
        key_insights: 'Extracted key data points from uploaded documents'
      });
      
      await sleep(800);
      
      emit('thinking', {
        thought: 'The uploaded documents contain valuable insights. I can now synthesize this with broader context.',
        thought_type: 'synthesis'
      });
      
      await sleep(1000);
    } else {
      emit('thinking', {
        thought: 'No uploaded files. I\'ll search for external information to answer this query.',
        thought_type: 'planning'
      });
      
      await sleep(1000);
      
      emit('tool.call', {
        tool: 'openai_search',
        purpose: 'Search public web for relevant information'
      });
      
      await sleep(2500);
      
      emit('tool.result', {
        tool: 'openai_search',
        findings_count: 8,
        key_insights: 'Found recent articles and data points relevant to the query'
      });
      
      await sleep(800);
    }
    
    // Synthesis thinking
    emit('thinking', {
      thought: 'Based on my analysis, I can now create a coherent report with key findings and recommendations.',
      thought_type: 'synthesis'
    });
    
    await sleep(1200);
    
    // Section completed
    emit('section.completed', {
      section: 'Executive Summary',
      preview: 'Based on comprehensive analysis of the data...'
    });
    
    await sleep(1000);
    
    emit('thinking', {
      thought: 'Let me add detailed findings and supporting evidence.',
      thought_type: 'writing'
    });
    
    await sleep(1000);
    
    emit('section.completed', {
      section: 'Key Findings',
      preview: '1. Primary insight identified from analysis\n2. Supporting evidence from multiple sources...'
    });
    
    await sleep(800);
    
    emit('thinking', {
      thought: 'Finalizing the report with actionable recommendations.',
      thought_type: 'final_review'
    });
    
    await sleep(1000);
    
    // Generate final report (hardcoded for Phase 1)
    const finalReport = `# Research Report

## Executive Summary

Based on comprehensive analysis${uploadedFiles.length > 0 ? ' of the uploaded documents' : ' of available information'}, this report provides key insights and actionable recommendations related to: "${run.query}"

## Key Findings

1. **Primary Insight**: ${uploadedFiles.length > 0 ? 'Document analysis reveals critical data points' : 'Recent trends indicate significant developments in this area'}
2. **Supporting Evidence**: Multiple sources corroborate the main findings
3. **Context**: ${run.depth === 'comprehensive' ? 'Extensive' : 'Focused'} analysis conducted

## Analysis

The research process involved:
- ${uploadedFiles.length > 0 ? `Secure analysis of ${uploadedFiles.length} uploaded document(s) using APIM` : 'External web search for recent information'}
- Synthesis of multiple data points
- Critical evaluation of findings

## Recommendations

1. Consider the primary insights in decision-making
2. Review supporting evidence for context
3. Monitor ongoing developments in this area

## Conclusion

This ${run.depth} research provides a solid foundation for understanding the topic. ${uploadedFiles.length > 0 ? 'The uploaded documents were instrumental in providing specific insights.' : 'External sources provided valuable context.'}

---

*Research completed at ${new Date().toISOString()}*
*Depth: ${run.depth}*
${uploadedFiles.length > 0 ? `*Files analyzed: ${uploadedFiles.length}*` : '*Sources: External web search*'}
`;
    
    // Final completion event
    emit('research.completed', {
      run_id: runId,
      report_content: finalReport,
      metadata: {
        word_count: finalReport.split(/\s+/).length,
        duration_seconds: 10,
        phase: 1, // Phase 1: Hardcoded
        files_analyzed: uploadedFiles.length,
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
