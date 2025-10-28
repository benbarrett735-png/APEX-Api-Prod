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
 * Process research with direct emission
 * Maps existing research SSE events → polling items
 */
async function processResearchWithEmitter(
  query: string,
  depth: string,
  uploadedFiles: any[],
  emit: (item: agentStore.AgentItem) => Promise<void>
): Promise<{ report: string; sources: string[]; charts: any }> {
  
  // Import existing research processing
  const { searchWeb } = await import('../services/openaiSearch.js');
  const { callAPIM } = await import('../services/agenticFlow.js');
  
  try {
    // Emit planning
    await emit({
      t: 'status',
      stage: 'planning',
      label: 'Planning research approach...'
    });
    
    // Create research plan via APIM
    const planPrompt = `Create a research plan for: "${query}". 
Depth: ${depth}. 
Documents: ${uploadedFiles.length} uploaded.

Output JSON with:
- understanding: { coreSubject, userGoal, needsExternal, needsDocAnalysis }
- searches: [ { query: "...", reasoning: "..." } ]
- reportSections: [ "..." ]`;
    
    const planMessages = [
      { role: 'system', content: 'You are a research planning assistant. Output valid JSON only.' },
      { role: 'user', content: planPrompt }
    ];
    
    await emit({
      t: 'status',
      stage: 'analyzing',
      label: 'Analyzing research approach...'
    });
    
    const planResponse = await callAPIM(planMessages);
    let plan: any;
    
    try {
      const content = planResponse.choices[0].message.content;
      plan = JSON.parse(content);
    } catch (e) {
      // Fallback plan
      plan = {
        understanding: { coreSubject: query, userGoal: `Research ${query}` },
        searches: [{ query, reasoning: 'Main search' }],
        reportSections: ['Overview', 'Key Findings', 'Conclusion']
      };
    }
    
    // Execute web searches
    const allFindings: string[] = [];
    const sources: string[] = [];
    
    if (plan.searches && plan.searches.length > 0) {
      await emit({
        t: 'status',
        stage: 'searching',
        label: `Searching web (${plan.searches.length} searches)...`
      });
      
      for (let i = 0; i < Math.min(plan.searches.length, 3); i++) {
        const search = plan.searches[i];
        try {
          const searchResult = await searchWeb(search.query);
          allFindings.push(...searchResult.findings);
          sources.push(...searchResult.sources);
          
          await emit({
            t: 'status',
            stage: 'searching',
            label: `Search ${i + 1}/${plan.searches.length}: ${searchResult.findings.length} findings`
          });
        } catch (err) {
          console.error('[Research Polling] Search error:', err);
        }
      }
    }
    
    // Generate report
    await emit({
      t: 'status',
      stage: 'synthesizing',
      label: 'Generating report...'
    });
    
    const reportPrompt = `Generate a ${depth} research report on: "${query}"

Findings:
${allFindings.slice(0, 20).join('\n')}

Sources:
${sources.slice(0, 10).join('\n')}

Structure:
${(plan.reportSections || ['Overview', 'Findings', 'Conclusion']).join(', ')}

Requirements:
- ${depth === 'short' ? '300-500' : depth === 'long' ? '1000-1500' : '600-900'} words
- Markdown format
- Cite sources
- Professional tone`;
    
    const reportMessages = [
      { role: 'system', content: 'You are a research report writer. Create comprehensive, well-structured reports.' },
      { role: 'user', content: reportPrompt }
    ];
    
    const reportResponse = await callAPIM(reportMessages);
    const report = reportResponse.choices[0].message.content;
    
    return {
      report,
      sources: Array.from(new Set(sources)).slice(0, 10),
      charts: {}
    };
    
  } catch (error: any) {
    console.error('[Research Polling] Processing error:', error);
    throw error;
  }
}

export default router;

