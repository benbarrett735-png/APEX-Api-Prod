/**
 * Research Polling Routes
 * 
 * Implements start → poll → append pattern for research agent
 * No long-held connections - each request completes in < 10s
 */

import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as agentStore from '../services/agentStore.js';

const router = express.Router();

/**
 * POST /research/runs - Start a research run (fast enqueue)
 * 
 * Body: { query, depth, uploaded_files[], include_charts[] }
 * Response: { runId }
 * Time: < 1s
 */
router.post('/runs', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { query, depth, uploaded_files, include_charts } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Invalid query' });
    }
    
    console.log('[Research Polling] Creating run:', { userId, query, depth });
    
    // Create run (fast)
    const runId = await agentStore.createRun(userId, 'research', {
      query,
      depth: depth || 'medium',
      uploaded_files: uploaded_files || [],
      include_charts: include_charts || []
    });
    
    console.log('[Research Polling] Run created:', runId);
    
    // Start background processing (don't wait)
    processResearchPolling(runId).catch(err => {
      console.error('[Research Polling] Background error:', err);
      agentStore.markError(runId, err.message);
    });
    
    res.json({ runId });
    
  } catch (error: any) {
    console.error('[Research Polling] Start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /research/runs/:runId/poll - Poll for new items
 * 
 * Query: ?cursor=<n>
 * Response: { items[], cursor, done, status }
 * Time: < 5s
 */
router.get('/runs/:runId/poll', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const runId = req.params.runId;
    const cursor = parseInt(req.query.cursor as string || '0', 10);
    
    console.log('[Research Polling] Poll:', { runId, cursor });
    
    const result = await agentStore.pollItems(runId, userId, cursor);
    
    res.json(result);
    
  } catch (error: any) {
    console.error('[Research Polling] Poll error:', error);
    
    if (error.message === 'Run not found') {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /research/runs/:runId - Cancel a run
 */
router.delete('/runs/:runId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const runId = req.params.runId;
    
    console.log('[Research Polling] Cancel:', { runId });
    
    await agentStore.cancelRun(runId, userId);
    
    res.status(204).end();
    
  } catch (error: any) {
    console.error('[Research Polling] Cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Background worker: Process research and emit incremental items
 */
async function processResearchPolling(runId: string): Promise<void> {
  console.log('[Research Polling] Background processing started:', runId);
  
  try {
    // Mark as running
    await agentStore.markRunning(runId);
    
    // Get run details
    const run = await agentStore.getRun(runId, ''); // TODO: Need to handle userId check
    if (!run) throw new Error('Run not found');
    
    const { query, depth, uploaded_files } = run.input;
    
    // Emit initial status
    await agentStore.appendItems(runId, [{
      t: 'status',
      stage: 'planning',
      label: 'Planning research...'
    }]);
    
    // Call existing research service with item emitter
    const emitter = async (item: agentStore.AgentItem) => {
      await agentStore.appendItems(runId, [item]);
    };
    
    // Process research (adapted from existing code)
    const result = await processResearchWithEmitter(query, depth, uploaded_files, emitter);
    
    // Emit final content
    await agentStore.appendItems(runId, [{
      t: 'text_delta',
      id: 'final_report',
      text: result.report
    }]);
    
    // Mark complete
    await agentStore.markComplete(runId, {
      report: result.report,
      sources: result.sources,
      charts: result.charts
    });
    
    console.log('[Research Polling] Background processing complete:', runId);
    
  } catch (error: any) {
    console.error('[Research Polling] Background processing error:', runId, error);
    await agentStore.markError(runId, error.message);
  }
}

/**
 * Wrapper around existing research logic with item emission
 * TODO: Integrate with existing researchService.ts
 */
async function processResearchWithEmitter(
  query: string,
  depth: string,
  uploadedFiles: any[],
  emit: (item: agentStore.AgentItem) => Promise<void>
): Promise<{ report: string; sources: string[]; charts: any }> {
  
  // Emit thinking
  await emit({
    t: 'status',
    stage: 'thinking',
    label: 'Analyzing query...'
  });
  
  // TODO: Call existing research logic
  // For now, placeholder that emits progress
  
  await emit({
    t: 'status',
    stage: 'searching',
    label: 'Searching web...'
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await emit({
    t: 'status',
    stage: 'synthesizing',
    label: 'Generating report...'
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    report: `# Research Report: ${query}\n\nPlaceholder report content.`,
    sources: [],
    charts: {}
  };
}

export default router;

