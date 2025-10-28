/**
 * Agent Run Store - Polling State Management
 * 
 * Provides start → poll → append pattern for agent runs
 * Avoids long-held connections to work with edge/Lambda timeouts
 */

import { query as dbQuery } from '../db/query.js';

export interface AgentRun {
  id: string;
  user_id: string;
  type: 'research' | 'report' | 'template' | 'chart';
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  input: any;
  metadata: any;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface AgentItem {
  t: 'text_delta' | 'partial_replace' | 'status' | 'tool' | 'complete';
  id?: string;
  text?: string;
  stage?: string;
  label?: string;
  [key: string]: any;
}

export interface PollResponse {
  items: AgentItem[];
  cursor: number;
  done: boolean;
  status: string;
}

/**
 * Create a new agent run (fast, < 1s)
 */
export async function createRun(
  userId: string,
  type: AgentRun['type'],
  input: any
): Promise<string> {
  const runId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  await dbQuery(
    `INSERT INTO agent_runs (id, user_id, type, status, input)
     VALUES ($1, $2, $3, 'queued', $4)`,
    [runId, userId, type, JSON.stringify(input)]
  );
  
  return runId;
}

/**
 * Get run details
 */
export async function getRun(runId: string, userId: string): Promise<AgentRun | null> {
  const result = await dbQuery(
    `SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2`,
    [runId, userId]
  );
  
  if (result.rows.length === 0) return null;
  
  return result.rows[0] as AgentRun;
}

/**
 * Update run status
 */
export async function updateRunStatus(
  runId: string,
  status: AgentRun['status'],
  metadata?: any
): Promise<void> {
  const updates: string[] = ['status = $2'];
  const params: any[] = [runId, status];
  
  if (status === 'done' || status === 'error') {
    updates.push('completed_at = NOW()');
  }
  
  if (metadata) {
    updates.push(`metadata = metadata || $${params.length + 1}::jsonb`);
    params.push(JSON.stringify(metadata));
  }
  
  await dbQuery(
    `UPDATE agent_runs SET ${updates.join(', ')} WHERE id = $1`,
    params
  );
}

/**
 * Append items to run (atomic, sequential cursor)
 */
export async function appendItems(runId: string, items: AgentItem[]): Promise<number> {
  if (items.length === 0) return 0;
  
  const itemsJson = items.map(item => ({
    type: item.t,
    payload: item
  }));
  
  const result = await dbQuery(
    `SELECT append_agent_items($1, $2::jsonb) as count`,
    [runId, JSON.stringify(itemsJson)]
  );
  
  return result.rows[0].count;
}

/**
 * Poll for new items since cursor (fast, < 5s)
 */
export async function pollItems(
  runId: string,
  userId: string,
  cursor: number = 0
): Promise<PollResponse> {
  // Get run status
  const run = await getRun(runId, userId);
  if (!run) {
    throw new Error('Run not found');
  }
  
  // Get new items since cursor
  const result = await dbQuery(
    `SELECT seq, type, payload
     FROM agent_run_items
     WHERE run_id = $1 AND seq > $2
     ORDER BY seq ASC
     LIMIT 100`,
    [runId, cursor]
  );
  
  const items = result.rows.map((row: any) => row.payload);
  const nextCursor = result.rows.length > 0
    ? result.rows[result.rows.length - 1].seq
    : cursor;
  
  const done = run.status === 'done' || run.status === 'error' || run.status === 'cancelled';
  
  return {
    items,
    cursor: nextCursor,
    done,
    status: run.status
  };
}

/**
 * Cancel a run
 */
export async function cancelRun(runId: string, userId: string): Promise<void> {
  await dbQuery(
    `UPDATE agent_runs SET status = 'cancelled', completed_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running')`,
    [runId, userId]
  );
}

/**
 * Mark run as running (worker should call this)
 */
export async function markRunning(runId: string): Promise<void> {
  await updateRunStatus(runId, 'running');
}

/**
 * Mark run as complete
 */
export async function markComplete(runId: string, metadata?: any): Promise<void> {
  await updateRunStatus(runId, 'done', metadata);
  
  // Append final "done" item
  await appendItems(runId, [{ t: 'complete' }]);
}

/**
 * Mark run as error
 */
export async function markError(runId: string, error: string): Promise<void> {
  await updateRunStatus(runId, 'error', { error });
  
  // Append error item
  await appendItems(runId, [{
    t: 'status',
    stage: 'error',
    label: `Error: ${error}`
  }]);
}

