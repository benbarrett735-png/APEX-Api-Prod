/**
 * Research Polling Adapter
 * 
 * Adapts existing SSE-based research logic to work with polling pattern
 * Maps SSE events → polling items
 */

import * as agentStore from './agentStore.js';
import { query as dbQuery } from '../db/query.js';

interface ResearchInput {
  query: string;
  depth: string;
  uploaded_files: any[];
  include_charts?: any[];
}

/**
 * Process research with polling emissions
 * Wraps existing research logic from research.ts
 */
export async function processResearchPolling(
  runId: string,
  input: ResearchInput
): Promise<void> {
  try {
    console.log('[Research Polling] Processing:', runId);
    
    // Mark as running
    await agentStore.markRunning(runId);
    
    // Emit initial status
    await agentStore.appendItems(runId, [{
      t: 'status',
      stage: 'planning',
      label: 'Analyzing request...'
    }]);
    
    // Get the run to access user_id
    const runResult = await dbQuery(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId]
    );
    
    if (runResult.rows.length === 0) {
      throw new Error('Run not found');
    }
    
    const run = runResult.rows[0];
    
    // Call existing research logic via database
    // The existing research.ts logic will process and store results
    // We'll poll the o1_research_runs table for completion
    
    // Create entry in o1_research_runs table (existing schema)
    const existingRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    
    await dbQuery(
      `INSERT INTO o1_research_runs 
       (id, user_id, query, status, depth, uploaded_files, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, 'planning', $4, $5, $6, NOW(), NOW())`,
      [
        existingRunId,
        run.user_id,
        input.query,
        input.depth || 'medium',
        JSON.stringify(input.uploaded_files || []),
        JSON.stringify({ polling_run_id: runId })
      ]
    );
    
    // Start background processing using existing research service
    // This will be handled by the existing /research/start endpoint internally
    processViaExistingResearch(existingRunId, runId).catch(err => {
      console.error('[Research Polling] Background error:', err);
      agentStore.markError(runId, err.message);
    });
    
  } catch (error: any) {
    console.error('[Research Polling] Error:', error);
    await agentStore.markError(runId, error.message);
  }
}

/**
 * Poll existing research table and emit items
 */
async function processViaExistingResearch(
  existingRunId: string,
  pollingRunId: string
): Promise<void> {
  
  // Poll the existing o1_research_runs table
  let lastStatus = 'planning';
  let checkCount = 0;
  const maxChecks = 180; // 3 minutes max (1s interval)
  
  while (checkCount < maxChecks) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    checkCount++;
    
    // Check status
    const result = await dbQuery(
      'SELECT status, report_content, metadata FROM o1_research_runs WHERE id = $1',
      [existingRunId]
    );
    
    if (result.rows.length === 0) break;
    
    const row = result.rows[0];
    const status = row.status;
    
    // Emit status changes
    if (status !== lastStatus) {
      await agentStore.appendItems(pollingRunId, [{
        t: 'status',
        stage: status,
        label: getStatusLabel(status)
      }]);
      lastStatus = status;
    }
    
    // Check for completion
    if (status === 'completed' && row.report_content) {
      // Emit final content
      await agentStore.appendItems(pollingRunId, [{
        t: 'text_delta',
        id: 'final_report',
        text: row.report_content
      }]);
      
      // Mark complete
      await agentStore.markComplete(pollingRunId, {
        report: row.report_content,
        metadata: row.metadata
      });
      
      break;
    }
    
    if (status === 'error') {
      await agentStore.markError(pollingRunId, 'Research failed');
      break;
    }
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planning: 'Planning research...',
    researching: 'Researching...',
    analyzing: 'Analyzing findings...',
    synthesizing: 'Generating report...',
    completed: 'Complete!',
    error: 'Error occurred'
  };
  return labels[status] || status;
}

