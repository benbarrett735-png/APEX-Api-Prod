/**
 * Polling Bridge - READ ONLY
 * 
 * Polls existing agent runs that are ALREADY WORKING
 * Just reads results from existing database tables
 * 
 * NO CHANGES to existing research/reports/templates logic!
 * 
 * USE CASES:
 * ✅ Initial agent runs (research, reports, templates, charts) - 2-5 minutes
 * ✅ Regeneration (re-runs full agent, also 2-5 minutes)
 * ❌ Follow-up chat ONLY (stays SSE - fast, < 30s)
 */

import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query as dbQuery } from '../db/query.js';

const router = express.Router();

/**
 * GET /polling/:type/:runId
 * 
 * Polls existing run results from database
 * Works with: research, reports, templates, agentic-flow (INITIAL RUNS ONLY)
 */
router.get('/polling/:type/:runId', requireAuth, async (req, res) => {
  try {
    const { type, runId } = req.params;
    const userId = req.auth?.sub as string;
    
    let result;
    
    switch (type) {
      case 'research':
        result = await pollResearch(runId, userId);
        break;
      case 'reports':
      case 'templates':
      case 'agentic':
      case 'charts':
        result = await pollAgentic(runId, userId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }
    
    res.json(result);
    
  } catch (error: any) {
    console.error('[Polling Bridge] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Poll research run (existing o1_research_runs table)
 */
async function pollResearch(runId: string, userId: string) {
  const result = await dbQuery(
    `SELECT status, report_content, metadata, created_at, updated_at
     FROM o1_research_runs
     WHERE id = $1 AND user_id = $2`,
    [runId, userId]
  );
  
  if (result.rows.length === 0) {
    return { status: 'not_found' };
  }
  
  const run = result.rows[0];
  
  return {
    status: run.status,
    done: run.status === 'completed' || run.status === 'error',
    content: run.report_content,
    metadata: run.metadata,
    updated_at: run.updated_at
  };
}

/**
 * Poll agentic/chart run (existing agentic_runs, agentic_artifacts, agentic_events tables)
 */
async function pollAgentic(runId: string, userId: string) {
  // Get run status
  const runResult = await dbQuery(
    `SELECT status, goal, started_at, finished_at
     FROM agentic_runs
     WHERE run_id = $1 AND user_id = $2`,
    [runId, userId]
  );
  
  if (runResult.rows.length === 0) {
    return { status: 'not_found' };
  }
  
  const run = runResult.rows[0];
  
  // Get artifacts
  const artifactsResult = await dbQuery(
    `SELECT artifact_key, uri, type, meta
     FROM agentic_artifacts
     WHERE run_id = $1
     ORDER BY created_at ASC`,
    [runId]
  );
  
  // Get latest events (last 50 for context)
  const eventsResult = await dbQuery(
    `SELECT event_type, payload, ts
     FROM agentic_events
     WHERE run_id = $1
     ORDER BY ts DESC
     LIMIT 50`,
    [runId]
  );
  
  return {
    status: run.status,
    done: run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
    goal: run.goal,
    artifacts: artifactsResult.rows,
    events: eventsResult.rows,
    started_at: run.started_at,
    finished_at: run.finished_at
  };
}

export default router;

