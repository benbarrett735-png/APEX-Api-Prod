/**
 * Agentic Flow API Routes
 * Unified routing layer for all agent modes (Research, Reports, Templates, Charts)
 * Per Kevin's plan: Use existing implementations, no duplication
 */

import { Router, Request, Response } from 'express';
import { AgenticFlow, callAPIM } from '../services/agenticFlow.js';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { processResearch } from './research.js';
import { generateReportAsync } from './reports.js';
import { generateTemplateAsync } from './templates.js';

const router = Router();

// Helper to generate run IDs with mode-specific prefixes
function generateRunId(mode: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  
  switch (mode) {
    case 'research':
      return `run_${timestamp}_${random}`;
    case 'reports':
      return `rpt_${timestamp}_${random}`;
    case 'templates':
      return `tpl_${timestamp}_${random}`;
    case 'charts':
      return `chart-${timestamp}-${random}`;
    default:
      return `run_${timestamp}_${random}`;
  }
}

/**
 * Helper: Ensure user and org exist (per Kevin's plan - extract from JWT)
 */
async function ensureUser(userId: string, email?: string, orgId?: string) {
  try {
    const defaultOrgId = orgId || '00000000-0000-0000-0000-000000000001';
    const orgCheck = await dbQuery('SELECT id FROM orgs WHERE id = $1', [defaultOrgId]);
    
    if (orgCheck.rows.length === 0) {
      await dbQuery(
        `INSERT INTO orgs (id, name, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [defaultOrgId, 'Default Organization']
      );
    }
    
    const userCheck = await dbQuery('SELECT id FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      await dbQuery(
        `INSERT INTO users (id, org_id, email, role, external_sub, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userId, defaultOrgId, email || `${userId}@cognito.local`, 'member', userId]
      );
    }
  } catch (error) {
    console.error('[AgenticFlow] Error ensuring user:', error);
    throw error;
  }
}

// ============================================================================
// Run Management
// ============================================================================

/**
 * Create a new agentic flow run
 */
router.post('/runs', requireAuth, async (req, res) => {
  try {
    const { goal, mode, reportLength, reportFocus, selectedCharts, fileContext, depth, templateType } = req.body;
    
    console.log('[POST /runs] req.auth present?', !!req.auth);
    console.log('[POST /runs] req.auth keys:', req.auth ? Object.keys(req.auth) : 'none');
    console.log('[POST /runs] req.auth.sub:', req.auth?.sub);
    
    // Extract user from validated JWT (per Kevin's plan)
    const userId = req.auth?.sub as string;
    const email = req.auth?.email as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      console.error('[POST /runs] FAILED: No userId in req.auth');
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    // Ensure user exists in database
    await ensureUser(userId, email);
    
    console.log(`\n========== [Unified POST /runs] ==========`);
    console.log(`Goal: ${goal?.substring(0, 50)}`);
    console.log(`Mode: ${mode}`);
    console.log(`User: ${userId}`);
    console.log(`==========================================\n`);
    
    if (!goal) {
      return res.status(400).json({ error: 'Goal is required' });
    }
    
    // Generate mode-specific run ID
    const runId = generateRunId(mode);
    
    // ====================
    // ROUTE BASED ON MODE
    // ====================
    
    switch (mode) {
      case 'research': {
        console.log(`[POST /runs] → RESEARCH handler`);
        
        // Create run in o1_research_runs table
        await dbQuery(
          `INSERT INTO o1_research_runs (
            id, user_id, query, depth, status, 
            uploaded_files, include_charts, target_sources, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            runId,
      userId, 
      goal, 
            depth || 'medium',
            'planning',
            JSON.stringify([]),
            JSON.stringify(selectedCharts || []),
            JSON.stringify([]),
            JSON.stringify({
              started_at: new Date().toISOString(),
              fileContext: fileContext || null
            })
          ]
        );
        
        // Start background processing
        setImmediate(() => {
          processResearch(runId, goal, [], depth || 'medium').catch((error) => {
            console.error('[Research Router] Error:', error);
            dbQuery(
              `UPDATE o1_research_runs 
               SET status = 'failed', 
                   metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text))
               WHERE id = $1`,
              [runId, error.message]
            ).catch(err => console.error('[Research Router] DB update failed:', err));
          });
        });
        
        return res.json({
      run_id: runId,
          runId: runId,
          status: 'planning'
        });
      }
      
      case 'reports': {
        console.log(`[POST /runs] → REPORTS handler`);
        
        await dbQuery(
          `INSERT INTO o1_research_runs (id, user_id, query, depth, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            runId,
            userId,
            goal,
            reportLength || 'medium',
            'running',
            JSON.stringify({
              reportLength: reportLength || 'medium',
              reportFocus: reportFocus || 'balanced',
              selectedCharts: selectedCharts || [],
              fileContext: fileContext || null
            })
          ]
        );
        
        setImmediate(() => {
          generateReportAsync(
            runId,
            userId,
            orgId,
            goal,
            reportLength || 'medium',
            reportFocus,
            selectedCharts,
            []
          ).catch((error) => {
            console.error('[Reports Router] Error:', error);
            dbQuery(
              `UPDATE o1_research_runs 
               SET status = 'failed', 
                   metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text))
               WHERE id = $1`,
              [runId, error.message]
            ).catch(err => console.error('[Reports Router] DB update failed:', err));
      });
    });

        return res.json({
          run_id: runId,
          runId: runId,
          status: 'running'
        });
      }
      
      case 'templates': {
        console.log(`[POST /runs] → TEMPLATES handler`);
        
        const finalTemplateType = templateType || 'business_brief';
        
        await dbQuery(
          `INSERT INTO o1_research_runs (id, user_id, query, depth, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            runId,
            userId,
            goal,
            depth || 'medium',
            'running',
            JSON.stringify({
              templateType: finalTemplateType,
              depth: depth || 'medium',
              fileContext: fileContext || null
            })
          ]
        );
        
        setImmediate(() => {
          generateTemplateAsync(
            runId,
            userId,
            orgId,
            goal,
            finalTemplateType,
            depth || 'medium',
            []
          ).catch((error) => {
            console.error('[Templates Router] Error:', error);
            dbQuery(
              `UPDATE o1_research_runs 
               SET status = 'failed', 
                   metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text))
               WHERE id = $1`,
              [runId, error.message]
            ).catch(err => console.error('[Templates Router] DB update failed:', err));
          });
        });
        
        return res.json({
          run_id: runId,
          runId: runId,
          status: 'running'
        });
      }
      
      case 'charts': {
        console.log(`[POST /runs] → CHARTS handler (existing AgenticFlow)`);
        
        const chartRunId = await AgenticFlow.createRun(userId, goal, 'charts', []);
    
    await dbQuery(
          `INSERT INTO agentic_events (ts, run_id, step_id, event_type, payload)
           VALUES (NOW(), $1, 'setup', 'context', $2)`,
          [chartRunId, JSON.stringify({
            selectedCharts: selectedCharts || [],
            fileContext: fileContext || null
          })]
        );
        
        setImmediate(() => {
          executeFlowAsync(chartRunId, userId, 'charts').catch((error) => {
            console.error(`[Charts Router] Error:`, error);
          });
        });
        
        return res.json({
          run_id: chartRunId,
          runId: chartRunId
        });
      }
      
      default:
        return res.status(400).json({ 
          error: 'Mode not supported',
          detail: `Supported: research, reports, templates, charts`
        });
    }

  } catch (error: any) {
    console.error('❌ [POST /runs] Error:', error.message);
    return res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * UNIFIED STREAM ENDPOINT
 * GET /runs/:runId/stream
 * Routes SSE streams based on runId prefix to the correct implementation
 * NOTE: No requireAuth here - EventSource can't send Authorization headers
 * Security: runId is secret and hard to guess (acts as access token)
 */
router.get('/runs/:runId/stream', async (req, res) => {
  const { runId } = req.params;
  
  // Try to get userId from auth if available, but don't require it
  const userId = req.auth?.sub as string;
  
  console.log(`\n========== [Stream Router] ==========`);
  console.log(`RunID: ${runId}`);
  console.log(`User: ${userId}`);
  console.log(`=====================================\n`);
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Helper to send SSE event
  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Keep-alive interval (2s pings)
  let pingCount = 0;
  const keepAliveInterval = setInterval(() => {
    try {
      pingCount++;
      res.write(`event: progress\ndata: {"status":"processing","ping":${pingCount}}\n\n`);
      if ((res as any).flush) {
        (res as any).flush();
      }
    } catch (err) {
      console.error('[Stream Router] Keep-alive failed:', err);
      clearInterval(keepAliveInterval);
    }
  }, 2000);
  
  try {
    // Detect mode from runId prefix
    let table: string;
    let mode: string;
    
    if (runId.startsWith('run_')) {
      table = 'o1_research_runs';
      mode = 'research';
    } else if (runId.startsWith('rpt_')) {
      table = 'o1_research_runs';
      mode = 'reports';
    } else if (runId.startsWith('tpl_')) {
      table = 'o1_research_runs';
      mode = 'templates';
    } else {
      table = 'agentic_runs';
      mode = 'charts';
    }
    
    console.log(`[Stream Router] Detected mode: ${mode}, table: ${table}`);
    
    // ===================================
    // UNIFIED STREAMING FOR R/R/T
    // ===================================
    if (mode === 'research' || mode === 'reports' || mode === 'templates') {
      // Get run (userId check optional since EventSource can't send auth)
      const runResult = userId 
        ? await dbQuery(`SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`, [runId, userId])
        : await dbQuery(`SELECT * FROM ${table} WHERE id = $1`, [runId]);
        
    if (runResult.rows.length === 0) {
      sendEvent('error', { message: 'Run not found' });
        clearInterval(keepAliveInterval);
      res.end();
      return;
    }

    const run = runResult.rows[0];
      sendEvent('run.init', { run, mode });
      
      // Stream events from o1_research_activities
      let lastId = 0;
    const pollInterval = setInterval(async () => {
      try {
        const newEvents = await dbQuery(
            `SELECT * FROM o1_research_activities 
             WHERE run_id = $1 AND id > $2 
             ORDER BY id ASC`,
            [runId, lastId]
        );

        for (const event of newEvents.rows) {
            const eventType = event.activity_type || event.type || 'update';
            sendEvent(eventType, event.details || {});
            lastId = event.id;
          }
          
          // Check if complete
          const statusCheck = await dbQuery(
            `SELECT status FROM ${table} WHERE id = $1`,
          [runId]
        );
        
          if (statusCheck.rows.length > 0) {
            const status = statusCheck.rows[0].status;
            if (status === 'completed' || status === 'failed') {
              // Get final content
              const contentResult = await dbQuery(
                `SELECT metadata FROM ${table} WHERE id = $1`,
              [runId]
            );
              
              if (contentResult.rows.length > 0) {
                const metadata = contentResult.rows[0].metadata;
                const reportContent = metadata?.report_content || metadata?.template_content || null;
                
                sendEvent(`${mode}.complete`, {
                  status,
                  report_content: reportContent,
                  runId
                });
              }
              
              clearInterval(pollInterval);
              clearInterval(keepAliveInterval);
              res.end();
            }
          }
        } catch (err) {
          console.error('[Stream Router] Polling error:', err);
          clearInterval(pollInterval);
          clearInterval(keepAliveInterval);
          res.end();
        }
      }, 1000);
      
      // Cleanup on client disconnect
      req.on('close', () => {
        console.log(`[Stream Router] Client disconnected`);
        clearInterval(pollInterval);
        clearInterval(keepAliveInterval);
        res.end();
      });
      
    }
    // ===================================
    // EXISTING CHARTS STREAMING
    // ===================================
    else if (mode === 'charts') {
      console.log('[Stream Router] Charts mode - delegating to polling');
      clearInterval(keepAliveInterval);
      sendEvent('info', { message: 'Charts use polling - connect to GET /runs/:runId instead' });
      res.end();
    }
    
  } catch (error: any) {
    console.error('[Stream Router] Error:', error);
    sendEvent('error', { message: error.message });
    clearInterval(keepAliveInterval);
    res.end();
  }
});

// ============================================================================
// APPLY AUTH TO ALL ROUTES BELOW THIS LINE
// (Stream endpoint above does NOT require auth - EventSource can't send headers)
// ============================================================================
router.use(requireAuth);

/**
 * Get run status and details
 */
/**
 * GET /agentic-flow/runs/:runId?cursor=N
 * Dual-mode polling endpoint (Portal-compatible)
 * 
 * TWO BEHAVIORS:
 * 1. WITH cursor param (?cursor=N) → Returns incremental items (research/reports/templates)
 * 2. WITHOUT cursor param → Returns full status (charts - legacy format)
 * 
 * This supports Portal's dual polling mechanism until charts migrates to cursor-based
 */
router.get('/runs/:runId', requireAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    const userId = req.auth?.sub as string;
    const hasCursor = req.query.cursor !== undefined;
    const cursor = parseInt(req.query.cursor as string) || 0;
    
    console.log(`[Poll] runId=${runId}, cursor=${hasCursor ? cursor : 'NONE'}, userId=${userId}`);
    
    // BRANCH 1: Cursor-based polling (research, reports, templates)
    if (hasCursor) {
      // Detect type from runId prefix
      const isResearch = runId.startsWith('run_');
      const isReport = runId.startsWith('rpt_');
      const isTemplate = runId.startsWith('tpl_');
      
      if (isResearch || isReport || isTemplate) {
      // Research/Reports/Templates mode - all use o1_research tables
      const runResult = await dbQuery(
        `SELECT status, query as goal, created_at, updated_at 
         FROM o1_research_runs 
         WHERE id = $1 AND user_id = $2`,
        [runId, userId]
      );
      
      if (runResult.rows.length === 0) {
        return res.status(404).json({ error: 'Research run not found' });
      }
      
      const run = runResult.rows[0];
      const isDone = run.status === 'completed' || run.status === 'error';
      
      // Get new activities since cursor
      const activitiesResult = await dbQuery(
        `SELECT id, activity_type, activity_data 
         FROM o1_research_activities 
         WHERE run_id = $1 AND id > $2 
         ORDER BY id ASC 
         LIMIT 100`,
        [runId, cursor]
      );
      
      // Transform activities to Portal format
      const items = activitiesResult.rows.map((activity: any) => {
        const data = activity.activity_data || {};
        
        switch (activity.activity_type) {
          case 'thinking':
            return {
              type: 'thinking',
              thought: data.thought || 'Processing...',
              thought_type: data.thought_type || 'planning'
            };
            
          case 'tool.call':
            return {
              type: 'tool_call',
              tool: data.tool,
              purpose: data.purpose
            };
            
          case 'tool.result':
            return {
              type: 'tool_result',
              tool: data.tool,
              findings_count: data.findings_count || 0
            };
            
          case 'section.completed':
            return {
              type: 'section_completed',
              section: data.section,
              preview: data.preview
            };
            
          case 'research.completed':
            return {
              type: 'completed',
              content: data.report_content
            };
            
          default:
            return {
              type: activity.activity_type,
              ...data
            };
        }
      });
      
      const newCursor = activitiesResult.rows.length > 0 
        ? activitiesResult.rows[activitiesResult.rows.length - 1].id 
        : cursor;
      
      console.log(`[Cursor Poll] Research: ${items.length} items, cursor=${newCursor}, done=${isDone}`);
      
      return res.json({
        items,
        cursor: newCursor,
        done: isDone,
        status: run.status,
        goal: run.goal
      });
      
                } else {
      // Agent mode (reports, templates, charts) - use agentic tables
      const runResult = await dbQuery(
        `SELECT status, goal, started_at, finished_at 
         FROM agentic_runs 
         WHERE run_id = $1 AND user_id = $2`,
        [runId, userId]
      );
      
      if (runResult.rows.length === 0) {
        return res.status(404).json({ error: 'Run not found' });
      }
      
      const run = runResult.rows[0];
      const isDone = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
      
      // Get new events since cursor (using BIGSERIAL id as cursor)
      const eventsResult = await dbQuery(
        `SELECT id, event_type, payload, ts 
         FROM agentic_events 
         WHERE run_id = $1 AND id > $2 
         ORDER BY id ASC 
         LIMIT 100`,
        [runId, cursor]
      );
      
      // Transform events to Portal format
      const items = eventsResult.rows.map((event: any) => {
        const payload = event.payload || {};
        
        // Map our event types to Portal's expected types
        switch (event.event_type) {
          case 'thinking':
          case 'thought':
            return {
              type: 'thinking',
              thought: payload.thought || payload.text || 'Processing...',
              thought_type: payload.thought_type || 'planning'
            };
            
          case 'tool_call':
          case 'tool.started':
            return {
              type: 'tool_call',
              tool: payload.tool || payload.tool_name,
              purpose: payload.purpose || payload.reasoning
            };
            
          case 'tool_result':
          case 'tool.completed':
            return {
              type: 'tool_result',
              tool: payload.tool || payload.tool_name,
              findings_count: payload.findings_count || payload.results?.length || 0
            };
            
          case 'text_delta':
          case 'output_chunk':
            return {
              type: 'text_delta',
              text: payload.text || payload.content
            };
            
          case 'section_completed':
            return {
              type: 'section_completed',
              section: payload.section,
              preview: payload.preview
            };
            
          case 'completed':
            return {
              type: 'completed',
              content: payload.content || payload.report_content
            };
            
          default:
            // Pass through unknown events
            return {
              type: event.event_type,
              ...payload
            };
        }
      });
      
      // Get highest event ID as new cursor
      const newCursor = eventsResult.rows.length > 0 
        ? eventsResult.rows[eventsResult.rows.length - 1].id 
        : cursor;
      
      console.log(`[Cursor Poll] Agent: ${items.length} items, cursor=${newCursor}, done=${isDone}`);
      
      return res.json({
        items,
        cursor: newCursor,
        done: isDone,
        status: run.status,
        goal: run.goal
      });
      }
    } 
    
    // BRANCH 2: Status-based polling (charts - legacy format)
    else {
      console.log(`[Poll] Status-based (Charts legacy) - runId=${runId}`);
      
      // Get run status from agentic_runs
      const runResult = await dbQuery(
        `SELECT run_id, goal, status, started_at, finished_at 
         FROM agentic_runs 
         WHERE run_id = $1 AND user_id = $2`,
        [runId, userId]
      );
      
      if (runResult.rows.length === 0) {
        return res.status(404).json({ error: 'Run not found' });
      }
      
      const run = runResult.rows[0];
      
      // Get all steps
      const stepsResult = await dbQuery(
        `SELECT step_id, action_name, status, started_at, finished_at, result_summary
         FROM agentic_steps
         WHERE run_id = $1
         ORDER BY started_at ASC`,
        [runId]
      );
      
      // Get all artifacts
      const artifactsResult = await dbQuery(
        `SELECT artifact_key, uri, type, meta
         FROM agentic_artifacts
         WHERE run_id = $1
         ORDER BY created_at ASC`,
        [runId]
      );
      
      // Get report content (if completed)
      let reportContent = null;
      if (run.status === 'completed') {
        // Check for report artifact
        const reportArtifact = artifactsResult.rows.find((a: any) => 
          a.type === 'report' || a.artifact_key === 'final_report'
        );
        if (reportArtifact && reportArtifact.uri) {
          // Extract content from URI if it's embedded
          if (reportArtifact.uri.startsWith('data:')) {
            reportContent = reportArtifact.meta?.content || reportArtifact.uri;
          }
        }
      }
      
      console.log(`[Poll] Status-based returning: status=${run.status}, steps=${stepsResult.rows.length}, artifacts=${artifactsResult.rows.length}`);
      
      return res.json({
        status: run.status,
        run_id: run.run_id,
        goal: run.goal,
        report_content: reportContent,
        steps: stepsResult.rows,
        artifacts: artifactsResult.rows,
        started_at: run.started_at,
        finished_at: run.finished_at
      });
    }

  } catch (error: any) {
    console.error('[Poll] Error:', error);
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
// Follow-up Chat & Regeneration
// ============================================================================

// (Old stream endpoint removed - unified stream endpoint is defined before auth middleware applies)

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

/**
 * POST /agentic-flow/:runId/chat
 * Follow-up conversational chat about a completed chart
 */
router.post('/:runId/chat', async (req, res) => {
  try {
    const { runId } = req.params;
    const { message, chatHistory } = req.body;
    const userId = (req as any).user?.sub || req.auth?.sub;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[AgenticFlow Chat] Follow-up question:', { runId, userId, message: message.substring(0, 100), historyLength: chatHistory?.length || 0 });

    // Retrieve the agentic run (charts mode)
    const result = await dbQuery(
      `SELECT run_id, user_id, mode, goal, status
       FROM agentic_runs
       WHERE run_id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chart run not found' });
    }

    const run = result.rows[0];

    if (run.status !== 'completed') {
      return res.status(400).json({ error: 'Chart is not yet completed. Please wait for the chart to finish generating.' });
    }

    // Get chart artifacts
    const artifactsResult = await dbQuery(
      `SELECT uri, type, meta FROM agentic_artifacts WHERE run_id = $1`,
      [runId]
    );

    let chartContent = `Goal: ${run.goal}\n\n`;
    if (artifactsResult.rows.length > 0) {
      for (const artifact of artifactsResult.rows) {
        const meta = typeof artifact.meta === 'string' ? JSON.parse(artifact.meta) : artifact.meta;
        if (meta.chart_url) {
          chartContent += `Chart Type: ${meta.chart_type || 'unknown'}\n`;
          chartContent += `Title: ${meta.title || 'Chart'}\n`;
          chartContent += `URL: ${meta.chart_url}\n\n`;
        }
      }
    }

    // Build context for APIM
    const chartContext = `CHART (Generated for goal: "${run.goal}"):\n\n${chartContent}`;

    const systemPrompt = `You are a helpful data visualization assistant. The user has a chart and is asking follow-up questions about it.

CHART CONTEXT:
${chartContext}

YOUR JOB:
- Answer questions BASED ON THE CHART DESCRIPTION
- Maintain conversation context from previous messages
- Be conversational and helpful
- Reference specific data points from the chart
- If asked something not in the chart, acknowledge limitations

CRITICAL:
- DO NOT make up data
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

    console.log('[AgenticFlow Chat] Calling APIM with', messages.length, 'messages...');

    // Call APIM for conversational response
    const response = await callAPIM(messages);

    const answer = response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    console.log('[AgenticFlow Chat] ✅ Follow-up answer generated');

    return res.json({
      success: true,
      answer
    });

  } catch (error: any) {
    console.error('[AgenticFlow Chat] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /agentic-flow/:runId/regenerate
 * Regenerate chart based on feedback/modifications
 */
router.post('/:runId/regenerate', async (req, res) => {
  try {
    const { runId } = req.params;
    const { feedback } = req.body;
    const userId = (req as any).user?.sub || req.auth?.sub;
    const orgId = (req as any).user?.['custom:org_id'] || req.auth?.['custom:org_id'] || '00000000-0000-0000-0000-000000000001';

    // ✅ Feedback is optional - if not provided, regenerate with original goal
    const feedbackText = (feedback && typeof feedback === 'string') ? feedback.trim() : '';

    console.log('[AgenticFlow Regenerate] Regenerating:', { 
      runId, 
      userId, 
      hasFeedback: feedbackText.length > 0,
      feedback: feedbackText ? feedbackText.substring(0, 100) : '(no feedback - regenerating original)' 
    });

    // Retrieve the original chart run
    const result = await dbQuery(
      `SELECT run_id, user_id, mode, goal, status
       FROM agentic_runs
       WHERE run_id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chart run not found' });
    }

    const originalRun = result.rows[0];

    if (originalRun.status !== 'completed') {
      return res.status(400).json({ error: 'Cannot regenerate - original chart is not yet completed.' });
    }

    // ✅ Simple: Just inject feedback into goal like research does
    const modifiedGoal = feedbackText 
      ? `${originalRun.goal}\n\nREGENERATION: ${feedbackText}`
      : originalRun.goal;
    
    console.log('[AgenticFlow Regenerate] Creating new run with modified goal:', modifiedGoal.substring(0, 200));

    // Create the run using the static method
    const newRunId = await AgenticFlow.createRun(userId, modifiedGoal, 'charts');

    console.log('[AgenticFlow Regenerate] Created new run:', newRunId);

    // Start async regeneration - create flow and execute
    setImmediate(() => {
      const flow = new AgenticFlow(newRunId, userId, 'charts');
      flow.execute().catch((error) => {
        console.error('[AgenticFlow Regenerate] Background processing error:', error);
      });
    });

    return res.json({
      success: true,
      run_id: newRunId,
      status: 'running',
      message: 'Chart regeneration started'
    });

  } catch (error: any) {
    console.error('[AgenticFlow Regenerate] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to start regeneration',
      details: error.message 
    });
  }
});

export default router;

