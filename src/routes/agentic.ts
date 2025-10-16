/**
 * Agentic Flow API Routes
 * 
 * WARNING: This route is currently DISABLED and uses deprecated OpenAI API keys.
 * If you need to enable this, update AgenticFlow service to use APIM only.
 * See chatApim.ts for the correct pattern.
 */

import { Router } from 'express';
import { AgenticFlow } from '../services/agentic.js';
import { query as dbQuery } from '../db/query.js';

const router = Router();

// ============================================================================
// Create & Start Run
// ============================================================================

router.post('/runs', async (req, res) => {
  try {
    const { goal, context, mode, charts, outputFormat } = req.body;
    
    // Get user ID from auth (fallback to dev headers)
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    // Build enhanced context
    const enhancedContext = {
      ...context,
      mode,
      charts,
      outputFormat,
      preferences: {
        mode,
        selected_charts: charts || [],
        output_format: outputFormat
      }
    };

    // Create flow instance
    // TODO: Update AgenticFlow to use APIM instead of direct OpenAI API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'DISABLED: This endpoint needs to be updated to use APIM. OpenAI API keys are no longer used.' });
    }

    const flow = new AgenticFlow(apiKey, process.env.MODEL || 'gpt-4o');
    
    // Create run and generate plan
    const runId = await flow.createRun(userId, goal, enhancedContext);
    
    // Return run ID
    res.json({ runId });
    
    // Start executing steps asynchronously
    executeRunAsync(flow, runId).catch(console.error);
    
  } catch (error: any) {
    console.error('Error creating run:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Execute run steps asynchronously
 */
async function executeRunAsync(flow: AgenticFlow, runId: string) {
  try {
    let shouldContinue = true;
    while (shouldContinue) {
      shouldContinue = await flow.executeNextStep(runId);
      
      // Small delay between steps
      if (shouldContinue) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error(`Error executing run ${runId}:`, error);
  }
}

// ============================================================================
// Get Run Status
// ============================================================================

router.get('/runs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Update AgenticFlow to use APIM instead of direct OpenAI API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'DISABLED: This endpoint needs to be updated to use APIM. OpenAI API keys are no longer used.' });
    }

    const flow = new AgenticFlow(apiKey);
    const status = await flow.getRunStatus(id);
    
    res.json(status);
  } catch (error: any) {
    console.error('Error getting run status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Stream Events (SSE)
// ============================================================================

router.get('/runs/:id/stream', async (req, res) => {
  const { id } = req.params;
  
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
    const runResult = await dbQuery(`SELECT * FROM runs WHERE id = $1`, [id]);
    if (runResult.rows.length === 0) {
      sendEvent('error', { message: 'Run not found' });
      res.end();
      return;
    }

    const run = runResult.rows[0];
    sendEvent('run.init', { run });

    // Send plan
    if (run.plan) {
      sendEvent('plan.created', { plan: run.plan });
    }

    // Send all steps
    const stepsResult = await dbQuery(
      `SELECT * FROM steps WHERE run_id = $1 ORDER BY idx ASC`,
      [id]
    );
    sendEvent('steps.init', { steps: stepsResult.rows });

    // Get last event ID we've sent
    let lastEventId = 0;
    const lastEventResult = await dbQuery(
      `SELECT id FROM events WHERE run_id = $1 ORDER BY id DESC LIMIT 1`,
      [id]
    );
    if (lastEventResult.rows.length > 0) {
      lastEventId = lastEventResult.rows[0].id;
    }

    // Poll for new events
    const pollInterval = setInterval(async () => {
      try {
        // Get new events
        const newEvents = await dbQuery(
          `SELECT * FROM events WHERE run_id = $1 AND id > $2 ORDER BY id ASC`,
          [id, lastEventId]
        );

        for (const event of newEvents.rows) {
          sendEvent(event.type, event.data);
          lastEventId = event.id;
        }

        // Check if run is complete
        const runCheckResult = await dbQuery(
          `SELECT status FROM runs WHERE id = $1`,
          [id]
        );
        
        if (runCheckResult.rows.length > 0) {
          const status = runCheckResult.rows[0].status;
          if (status === 'DONE' || status === 'ERROR') {
            sendEvent('run.complete', { status });
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
// Cancel Run
// ============================================================================

router.post('/runs/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    await dbQuery(
      `UPDATE runs SET status = 'ERROR', error_message = 'Cancelled by user' WHERE id = $1`,
      [id]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error cancelling run:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// List Runs
// ============================================================================

router.get('/runs', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await dbQuery(
      `SELECT 
        r.*,
        (SELECT COUNT(*) FROM steps WHERE run_id = r.id) as total_steps,
        (SELECT COUNT(*) FROM steps WHERE run_id = r.id AND status = 'DONE') as completed_steps
       FROM runs r
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ runs: result.rows });
  } catch (error: any) {
    console.error('Error listing runs:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

