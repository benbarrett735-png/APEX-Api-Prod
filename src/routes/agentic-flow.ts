/**
 * Agentic Flow API Routes
 * Manus.im style agentic flow for chat integration
 */

import { Router } from 'express';
import { AgenticFlow } from '../services/agenticFlow.js';
import { query as dbQuery } from '../db/query.js';

const router = Router();

// ============================================================================
// Run Management
// ============================================================================

/**
 * Create a new agentic flow run
 */
router.post('/runs', async (req, res) => {
  try {
    const { goal, mode, completion_criteria, reportLength, reportFocus, selectedCharts, fileContext } = req.body;
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    console.log(`[POST /runs] Request received:`);
    console.log(`  - Goal: ${goal}`);
    console.log(`  - Mode: ${mode}`);
    console.log(`  - Selected Charts: ${selectedCharts ? selectedCharts.join(', ') : 'none'}`);
    console.log(`  - File Context: ${fileContext ? fileContext.length + ' chars' : 'none'}`);
    
    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }
    
    // Validate that the mode is supported
    const supportedModes = ['reports', 'charts', 'research'];
    if (mode && !supportedModes.includes(mode)) {
      return res.status(400).json({ 
        error: 'Mode not implemented',
        detail: `Mode "${mode}" is not yet available. Currently supported modes: ${supportedModes.join(', ')}`
      });
    }

    const runId = await AgenticFlow.createRun(
      userId, 
      goal, 
      mode || 'general',
      completion_criteria
    );

    // Store additional context for reports, charts, and research modes (including file content)
    if (mode === 'reports' || mode === 'charts' || mode === 'research') {
      await dbQuery(
        `INSERT INTO agentic_events (ts, run_id, step_id, event_type, payload)
         VALUES (NOW(), $1, 'setup', 'context', $2)`,
        [runId, JSON.stringify({
          reportLength: mode === 'reports' ? reportLength : undefined,
          reportFocus: mode === 'reports' ? reportFocus : undefined,
          selectedCharts: selectedCharts || [],
          fileContext: fileContext || null // Store parsed file content
        })]
      );
    }

    res.json({ 
      run_id: runId,
      message: 'Agentic flow run created successfully'
    });

    // Explicitly end the response to prevent App Runner from waiting
    setImmediate(() => {
      // Start execution asynchronously AFTER response is closed
      console.log(`[POST /runs] Starting async execution for run ${runId}`);
      console.log(`[POST /runs] About to call executeFlowAsync`);
      console.log(`[POST /runs] User ID: ${userId}`);
      console.log(`[POST /runs] Mode: ${mode || 'general'}`);
      
      // Call executeFlowAsync in detached context
      executeFlowAsync(runId, userId, mode || 'general').catch((error) => {
        console.error(`[POST /runs] ❌ executeFlowAsync failed:`, error.message);
        console.error(`[POST /runs] ❌ executeFlowAsync stack:`, error.stack);
      });
    });

  } catch (error: any) {
    console.error('❌❌❌ Error creating agentic flow run ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * Get run status and details
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const status = await AgenticFlow.getRunStatus(runId);
    res.json(status);

  } catch (error: any) {
    console.error('Error getting run status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List user's runs
 */
router.get('/runs', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await dbQuery(
      `SELECT 
        r.*,
        (SELECT COUNT(*) FROM agentic_steps WHERE run_id = r.run_id) as total_steps,
        (SELECT COUNT(*) FROM agentic_steps WHERE run_id = r.run_id AND status = 'completed') as completed_steps
       FROM agentic_runs r
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ runs: result.rows });

  } catch (error: any) {
    console.error('Error listing runs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel a run
 */
router.post('/runs/:runId/cancel', async (req, res) => {
  try {
    const { runId } = req.params;
    
    await dbQuery(
      `UPDATE agentic_runs SET status = 'cancelled', finished_at = NOW() WHERE run_id = $1`,
      [runId]
    );
    
    res.json({ success: true, message: 'Run cancelled successfully' });

  } catch (error: any) {
    console.error('Error cancelling run:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Real-time Updates (SSE)
// ============================================================================

/**
 * Stream run events via SSE
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
      sendEvent('error', { message: 'Run not found' });
      res.end();
      return;
    }

    const run = runResult.rows[0];
    sendEvent('run.init', { run });

    // Send all steps
    const stepsResult = await dbQuery(
      `SELECT * FROM agentic_steps WHERE run_id = $1 ORDER BY started_at ASC`,
      [runId]
    );
    sendEvent('steps.init', { steps: stepsResult.rows });

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
            // Get run mode to determine what content to return
            const runModeResult = await dbQuery(
              `SELECT goal, completion_criteria FROM agentic_runs WHERE run_id = $1`,
              [runId]
            );
            const runGoal = runModeResult.rows[0]?.goal || '';
            const completionCriteria = runModeResult.rows[0]?.completion_criteria || [];
            
            // Extract mode from completion criteria
            let runMode = 'reports'; // Default
            if (Array.isArray(completionCriteria)) {
              const modeEntry = completionCriteria.find((c: string) => c.startsWith('mode:'));
              if (modeEntry) {
                runMode = modeEntry.split(':')[1];
              }
            }
            
            let reportContent = null;
            
            if (runMode === 'charts') {
              // CHARTS MODE: Get all generated charts and display them
              const chartsResult = await dbQuery(
                `SELECT meta FROM agentic_artifacts WHERE run_id = $1 AND artifact_key LIKE '%chart%' ORDER BY created_at ASC`,
                [runId]
              );
              
              if (chartsResult.rows.length > 0) {
                let chartsMarkdown = `# ${runGoal}\n\n`;
                chartsMarkdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
                chartsMarkdown += `---\n\n`;
                
                chartsResult.rows.forEach((row, idx) => {
                  // Parse meta if it's a string (from JSONB column)
                  const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
                  if (meta.chart_url) {
                    chartsMarkdown += `## ${meta.title || `Chart ${idx + 1}`}\n\n`;
                    chartsMarkdown += `![${meta.title || `Chart ${idx + 1}`}](${meta.chart_url})\n\n`;
                    chartsMarkdown += `**Type:** ${meta.chart_type || 'unknown'}\n\n`;
                    chartsMarkdown += `---\n\n`;
                  }
                });
                
                reportContent = chartsMarkdown;
              }
            } else {
              // REPORTS MODE: Get the assembled report
              console.log(`[Streaming] ========== RETRIEVING REPORT ==========`);
              console.log(`[Streaming] Run ID: ${runId}`);
              console.log(`[Streaming] Mode: ${runMode}`);
              
              // First, let's see what artifacts exist
              const allArtifacts = await dbQuery(
                `SELECT artifact_key, type FROM agentic_artifacts WHERE run_id = $1 ORDER BY created_at ASC`,
                [runId]
              );
              console.log(`[Streaming] Found ${allArtifacts.rows.length} total artifacts:`);
              allArtifacts.rows.forEach(r => console.log(`  - ${r.artifact_key} (type: ${r.type})`));
              
              const reportArtifact = await dbQuery(
                `SELECT artifact_key, meta FROM agentic_artifacts WHERE run_id = $1 AND artifact_key LIKE '%assemble_report%' ORDER BY created_at DESC LIMIT 1`,
                [runId]
              );
              
              console.log(`[Streaming] Query for assemble_report artifacts returned ${reportArtifact.rows.length} results`);
              
              if (reportArtifact.rows.length > 0) {
                const row = reportArtifact.rows[0];
                console.log(`[Streaming] Found report artifact: ${row.artifact_key}`);
                console.log(`[Streaming] Raw meta type:`, typeof row.meta);
                
                // Parse meta if it's a string (from JSONB column)
                const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
                
                console.log(`[Streaming] Parsed meta keys:`, Object.keys(meta));
                console.log(`[Streaming] Has meta.report:`, !!meta.report);
                if (meta.report) {
                  console.log(`[Streaming] Report object keys:`, Object.keys(meta.report));
                  console.log(`[Streaming] Has full_content:`, !!meta.report.full_content);
                  reportContent = meta.report.full_content || null;
                  console.log(`[Streaming] Extracted report content length: ${reportContent ? reportContent.length : 0}`);
                  if (reportContent) {
                    console.log(`[Streaming] Report preview (first 200 chars): ${reportContent.substring(0, 200)}`);
                  }
                } else {
                  console.log(`[Streaming] ⚠️ meta.report is undefined`);
                }
              } else {
                console.log(`[Streaming] ⚠️ No assemble_report artifact found, checking for any artifacts with 'report' in key`);
                const anyReportArtifact = await dbQuery(
                  `SELECT artifact_key, meta FROM agentic_artifacts WHERE run_id = $1 AND artifact_key LIKE '%report%' ORDER BY created_at DESC LIMIT 1`,
                  [runId]
                );
                if (anyReportArtifact.rows.length > 0) {
                  const row = anyReportArtifact.rows[0];
                  console.log(`[Streaming] Found alternative report artifact: ${row.artifact_key}`);
                  
                  // Parse meta if it's a string (from JSONB column)
                  const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
                  
                  reportContent = meta.report?.full_content || null;
                  console.log(`[Streaming] Found report content in alternative artifact, length: ${reportContent ? reportContent.length : 0}`);
                } else {
                  console.log(`[Streaming] ❌ No report artifacts found at all`);
                }
              }
              console.log(`[Streaming] ========== REPORT RETRIEVAL COMPLETE ==========`);
            }
            
            console.log(`[Streaming] ========== SENDING run.complete EVENT ==========`);
            console.log(`[Streaming] Status: ${status}`);
            console.log(`[Streaming] Report content: ${reportContent ? `${reportContent.length} chars` : 'null/empty'}`);
            if (reportContent) {
              console.log(`[Streaming] Report content preview (first 300 chars):\n${reportContent.substring(0, 300)}`);
            }
            console.log(`[Streaming] ========== SENDING EVENT NOW ==========`);
            
            sendEvent('run.complete', { status, reportContent });
            clearInterval(pollInterval);
            res.end();
          }
        }
      } catch (error) {
        console.error('Error polling events:', error);
      }
    }, 1000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });

  } catch (error: any) {
    console.error('Error streaming events:', error);
    sendEvent('error', { message: error.message });
    res.end();
  }
});

// ============================================================================
// Action Execution (APIM Facade)
// ============================================================================

/**
 * Execute a specific action (for testing/debugging)
 */
router.post('/actions/:actionName', async (req, res) => {
  try {
    const { actionName } = req.params;
    const { args, correlation_id } = req.body;
    
    // Create a temporary flow instance to use action handlers
    const tempFlow = new AgenticFlow('temp', 'temp');
    
    // Execute action
    const result = await (tempFlow as any).dispatchAction(actionName, args || {});
    
    res.json({
      success: true,
      result,
      correlation_id
    });

  } catch (error: any) {
    console.error('Error executing action:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      correlation_id: req.body.correlation_id
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute flow asynchronously
 */
async function executeFlowAsync(runId: string, userId: string, mode: string): Promise<void> {
  try {
    console.log(`[executeFlowAsync] ========== STARTING FLOW ==========`);
    console.log(`[executeFlowAsync] Run ID: ${runId}`);
    console.log(`[executeFlowAsync] User ID: ${userId}`);
    console.log(`[executeFlowAsync] Mode: ${mode}`);
    
    const flow = new AgenticFlow(runId, userId, mode);
    console.log(`[executeFlowAsync] ✅ AgenticFlow instance created`);
    
    console.log(`[executeFlowAsync] About to call flow.execute()...`);
    await flow.execute();
    console.log(`[executeFlowAsync] ✅ Completed execution for run ${runId}`);
    console.log(`[executeFlowAsync] ========== FLOW COMPLETE ==========`);
  } catch (error: any) {
    console.error(`[executeFlowAsync] ========== FLOW ERROR ==========`);
    console.error(`[executeFlowAsync] ❌ Error executing flow ${runId}:`, error.message);
    console.error(`[executeFlowAsync] Stack trace:`, error.stack);
    console.error(`[executeFlowAsync] ========== END ERROR ==========`);
  }
}

export default router;

