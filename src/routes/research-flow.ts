/**
 * Research Flow API Routes
 * 
 * Separate agentic flow for external research
 * Focus: Web scraping with APIM planning + OpenAI execution
 */

import { Router } from 'express';
import { ResearchFlow } from '../services/researchFlow.js';
import { query as dbQuery } from '../db/query.js';

const router = Router();

// ============================================================================
// Research Run Management
// ============================================================================

/**
 * Create a new research flow run
 */
router.post('/runs', async (req, res) => {
  try {
    const { goal, researchDepth, targetUrls, fileContext } = req.body;
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    console.log(`[POST /research-flow/runs] Request received:`);
    console.log(`  - Goal: ${goal}`);
    console.log(`  - Research Depth: ${researchDepth || 'standard'}`);
    console.log(`  - Target URLs: ${targetUrls ? targetUrls.length : 0}`);
    console.log(`  - File Context: ${fileContext ? fileContext.length + ' chars' : 'none'}`);
    
    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }

    const runId = await ResearchFlow.createRun(userId, goal);

    // Store research context
    await dbQuery(
      `INSERT INTO agentic_events (ts, run_id, step_id, event_type, payload)
       VALUES (NOW(), $1, 'setup', 'context', $2)`,
      [runId, JSON.stringify({
        researchDepth: researchDepth || 'standard',
        targetUrls: targetUrls || [],
        fileContext: fileContext || null
      })]
    );

    res.json({ 
      run_id: runId,
      message: 'Research flow run created successfully'
    });

    // Start execution asynchronously
    console.log(`[POST /research-flow/runs] Starting async execution for run ${runId}`);
    
    executeResearchAsync(runId, userId).catch((error) => {
      console.error(`[POST /research-flow/runs] ❌ executeResearchAsync failed:`, error.message);
      console.error(`[POST /research-flow/runs] ❌ Stack:`, error.stack);
    });

  } catch (error: any) {
    console.error('❌ Error creating research flow run:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * Get research run status and details
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const status = await ResearchFlow.getRunStatus(runId);
    res.json(status);

  } catch (error: any) {
    console.error('Error getting research run status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List user's research runs
 */
router.get('/runs', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await dbQuery(
      `SELECT r.*
       FROM agentic_runs r
       WHERE user_id = $1 
       AND run_id LIKE 'research_%'
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ runs: result.rows });

  } catch (error: any) {
    console.error('Error listing research runs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel a research run
 */
router.post('/runs/:runId/cancel', async (req, res) => {
  try {
    const { runId } = req.params;
    
    await dbQuery(
      `UPDATE agentic_runs SET status = 'cancelled', finished_at = NOW() WHERE run_id = $1`,
      [runId]
    );
    
    res.json({ success: true, message: 'Research run cancelled successfully' });

  } catch (error: any) {
    console.error('Error cancelling research run:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Real-time Updates (SSE)
// ============================================================================

/**
 * Stream research run events via SSE
 */
router.get('/runs/:runId/stream', async (req, res) => {
  const { runId } = req.params;
  
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Helper to send SSE event
  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Send initial run state
    const runResult = await dbQuery(`SELECT * FROM agentic_runs WHERE run_id = $1`, [runId]);
    if (runResult.rows.length === 0) {
      sendEvent('error', { message: 'Research run not found' });
      res.end();
      return;
    }

    const run = runResult.rows[0];
    sendEvent('run.init', { run });

    // Send all artifacts
    const artifactsResult = await dbQuery(
      `SELECT * FROM agentic_artifacts WHERE run_id = $1 ORDER BY created_at ASC`,
      [runId]
    );
    sendEvent('artifacts.init', { artifacts: artifactsResult.rows });

    // Get last event timestamp
    let lastEventTs = new Date(0);
    const lastEventResult = await dbQuery(
      `SELECT ts FROM agentic_events WHERE run_id = $1 ORDER BY ts DESC LIMIT 1`,
      [runId]
    );
    if (lastEventResult.rows.length > 0) {
      lastEventTs = new Date(lastEventResult.rows[0].ts);
    }

    // Poll for new events
    const pollInterval = setInterval(async () => {
      try {
        // Get new events
        const newEvents = await dbQuery(
          `SELECT * FROM agentic_events WHERE run_id = $1 AND ts > $2 ORDER BY ts ASC`,
          [runId, lastEventTs]
        );

        for (const event of newEvents.rows) {
          sendEvent(event.event_type, event.payload);
          lastEventTs = new Date(event.ts);
        }

        // Check if run is complete
        const runCheckResult = await dbQuery(
          `SELECT status FROM agentic_runs WHERE run_id = $1`,
          [runId]
        );
        
        if (runCheckResult.rows.length > 0) {
          const status = runCheckResult.rows[0].status;
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            
            // Get the research report artifact
            let researchContent = null;
            
            const reportArtifact = await dbQuery(
              `SELECT meta FROM agentic_artifacts 
               WHERE run_id = $1 AND artifact_key LIKE '%research_report%' 
               ORDER BY created_at DESC LIMIT 1`,
              [runId]
            );
            
            if (reportArtifact.rows.length > 0) {
              const row = reportArtifact.rows[0];
              const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
              researchContent = meta.report?.full_content || null;
              
              console.log(`[Streaming] Research content length: ${researchContent ? researchContent.length : 0}`);
            }
            
            console.log(`[Streaming] Sending research.complete event`);
            console.log(`[Streaming] Status: ${status}`);
            console.log(`[Streaming] Content: ${researchContent ? `${researchContent.length} chars` : 'null'}`);
            
            sendEvent('research.complete', { status, researchContent });
            clearInterval(pollInterval);
            res.end();
          }
        }
      } catch (error) {
        console.error('Error polling research events:', error);
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });

  } catch (error: any) {
    console.error('Error streaming research events:', error);
    sendEvent('error', { message: error.message });
    res.end();
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute research flow asynchronously
 */
async function executeResearchAsync(runId: string, userId: string): Promise<void> {
  try {
    console.log(`[executeResearchAsync] ========== STARTING RESEARCH ==========`);
    console.log(`[executeResearchAsync] Run ID: ${runId}`);
    console.log(`[executeResearchAsync] User ID: ${userId}`);
    
    const flow = new ResearchFlow(runId, userId);
    console.log(`[executeResearchAsync] ✅ ResearchFlow instance created`);
    
    console.log(`[executeResearchAsync] About to call flow.execute()...`);
    await flow.execute();
    console.log(`[executeResearchAsync] ✅ Completed research for run ${runId}`);
    console.log(`[executeResearchAsync] ========== RESEARCH COMPLETE ==========`);
  } catch (error: any) {
    console.error(`[executeResearchAsync] ========== RESEARCH ERROR ==========`);
    console.error(`[executeResearchAsync] ❌ Error executing research ${runId}:`, error.message);
    console.error(`[executeResearchAsync] Stack trace:`, error.stack);
    console.error(`[executeResearchAsync] ========== END ERROR ==========`);
  }
}

export default router;


