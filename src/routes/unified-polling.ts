/**
 * Unified Polling Routes
 * 
 * Single endpoint for all agent types: research, reports, templates, charts
 * Maps to Portal's /api/runs expectations
 */

import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as agentStore from '../services/agentStore.js';
import { searchWeb } from '../services/openaiSearch.js';
import { callAPIM } from '../services/agenticFlow.js';

const router = express.Router();

/**
 * POST /runs - Start any agent run
 * 
 * Body: { mode, prompt/query, ...agent-specific params }
 * Response: { runId }
 */
router.post('/runs', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { mode, prompt, query, depth, uploaded_files, include_charts, template_type } = req.body;
    
    // Determine agent type
    const agentType = mode || detectAgentType(req.body);
    
    if (!agentType) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }
    
    console.log('[Unified Polling] Creating run:', { userId, agentType });
    
    // Create run
    const runId = await agentStore.createRun(userId, agentType as any, req.body);
    
    console.log('[Unified Polling] Run created:', runId);
    
    // Start background processing
    processAgentRun(runId, agentType, req.body).catch(err => {
      console.error('[Unified Polling] Background error:', err);
      agentStore.markError(runId, err.message);
    });
    
    res.json({ runId });
    
  } catch (error: any) {
    console.error('[Unified Polling] Start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /runs/:runId - Poll for updates
 * 
 * Query: ?cursor=<n>
 * Response: { items[], cursor, done, status }
 */
router.get('/runs/:runId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const runId = req.params.runId;
    const cursor = parseInt(req.query.cursor as string || '0', 10);
    
    const result = await agentStore.pollItems(runId, userId, cursor);
    
    // Map item types to match Portal expectations
    const mappedItems = result.items.map(mapItemToPortalFormat);
    
    res.json({
      ...result,
      items: mappedItems
    });
    
  } catch (error: any) {
    console.error('[Unified Polling] Poll error:', error);
    
    if (error.message === 'Run not found') {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /runs/:runId - Cancel run
 */
router.delete('/runs/:runId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const runId = req.params.runId;
    
    await agentStore.cancelRun(runId, userId);
    res.status(204).end();
    
  } catch (error: any) {
    console.error('[Unified Polling] Cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// BACKGROUND PROCESSING
// ============================================================================

async function processAgentRun(runId: string, agentType: string, input: any): Promise<void> {
  try {
    await agentStore.markRunning(runId);
    
    switch (agentType) {
      case 'research':
        await processResearch(runId, input);
        break;
      case 'report':
        await processReport(runId, input);
        break;
      case 'template':
        await processTemplate(runId, input);
        break;
      case 'chart':
        await processChart(runId, input);
        break;
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
    
  } catch (error: any) {
    console.error(`[Unified Polling] ${agentType} processing error:`, error);
    await agentStore.markError(runId, error.message);
  }
}

// ============================================================================
// AGENT PROCESSORS
// ============================================================================

async function processResearch(runId: string, input: any): Promise<void> {
  const emit = async (item: agentStore.AgentItem) => {
    await agentStore.appendItems(runId, [item]);
  };
  
  const { query, depth = 'medium', uploaded_files = [] } = input;
  
  try {
    // Planning
    await emit({ t: 'status', stage: 'planning', label: 'Planning research...' });
    
    // Simple plan
    const searchQuery = query;
    
    // Search
    await emit({ t: 'status', stage: 'searching', label: 'Searching web...' });
    
    const searchResult = await searchWeb(searchQuery);
    
    await emit({ t: 'status', stage: 'searching', label: `Found ${searchResult.findings.length} findings` });
    
    // Generate report
    await emit({ t: 'status', stage: 'synthesizing', label: 'Generating report...' });
    
    const reportPrompt = `Generate a ${depth} research report on: "${query}"

Findings:
${searchResult.findings.slice(0, 20).join('\n')}

Sources:
${searchResult.sources.slice(0, 10).join('\n')}

Requirements:
- ${depth === 'short' ? '300-500' : depth === 'long' ? '1000-1500' : '600-900'} words
- Markdown format
- Professional tone`;
    
    const reportResponse = await callAPIM([
      { role: 'system', content: 'You are a research report writer.' },
      { role: 'user', content: reportPrompt }
    ]);
    
    const report = reportResponse.choices[0].message.content;
    
    // Emit report incrementally (simulate streaming)
    const chunks = splitIntoChunks(report, 200);
    for (const chunk of chunks) {
      await emit({ t: 'text_delta', text: chunk });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Complete
    await agentStore.markComplete(runId, {
      report,
      sources: searchResult.sources.slice(0, 10)
    });
    
  } catch (error: any) {
    throw error;
  }
}

async function processReport(runId: string, input: any): Promise<void> {
  // Similar to research but with report-specific logic
  await processResearch(runId, input); // Reuse for now
}

async function processTemplate(runId: string, input: any): Promise<void> {
  const emit = async (item: agentStore.AgentItem) => {
    await agentStore.appendItems(runId, [item]);
  };
  
  const { prompt, template_type } = input;
  
  await emit({ t: 'status', stage: 'generating', label: 'Generating template...' });
  
  const response = await callAPIM([
    { role: 'system', content: `You are a ${template_type} template generator.` },
    { role: 'user', content: prompt }
  ]);
  
  const content = response.choices[0].message.content;
  
  const chunks = splitIntoChunks(content, 200);
  for (const chunk of chunks) {
    await emit({ t: 'text_delta', text: chunk });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await agentStore.markComplete(runId, { content });
}

async function processChart(runId: string, input: any): Promise<void> {
  const emit = async (item: agentStore.AgentItem) => {
    await agentStore.appendItems(runId, [item]);
  };
  
  await emit({ t: 'status', stage: 'generating', label: 'Creating chart...' });
  
  // Placeholder - integrate with chart service
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await emit({ t: 'status', stage: 'complete', label: 'Chart ready!' });
  
  await agentStore.markComplete(runId, { chartUrl: '/charts/placeholder.png' });
}

// ============================================================================
// HELPERS
// ============================================================================

function detectAgentType(body: any): string | null {
  if (body.query || body.depth) return 'research';
  if (body.template_type) return 'template';
  if (body.chart_type) return 'chart';
  return 'research'; // default
}

function mapItemToPortalFormat(item: any): any {
  // Map internal item format to Portal's expected format
  const mapped: any = { ...item };
  
  // Map 't' to 'type' if needed
  if (item.t && !item.type) {
    mapped.type = item.t;
  }
  
  return mapped;
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export default router;

