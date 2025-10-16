import { pool } from './pool.js';
import type { PoolClient } from 'pg';

export async function withOrgTx(orgId: string, fn: (client: PoolClient) => Promise<any>) {
  if (!pool) {
    throw new Error('Database not configured. Please set DATABASE_URL environment variable.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Next.js API route wrapper
export function withOrg(
  handler: (req: any, res: any, ctx: { orgId: string; userId: string }) => Promise<void>
) {
  return async (req: any, res: any) => {
    try {
      // Extract org and user from request context
      // For now, use mock values - in production this would come from auth middleware
      const orgId = req.ctx?.orgId || 'mock-org-id';
      const userId = req.ctx?.userId || 'mock-user-id';

      return await handler(req, res, { orgId, userId });
    } catch (error) {
      console.error('Error in withOrg wrapper:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

