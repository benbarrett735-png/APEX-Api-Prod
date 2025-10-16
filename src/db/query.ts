import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from './pool.js';

export async function one<T extends QueryResultRow>(client: PoolClient, sql: string, params: any[] = []): Promise<T | null> {
  const res: QueryResult<T> = (await client.query(sql, params)) as QueryResult<T>;
  return res.rows[0] ?? null;
}

export async function many<T extends QueryResultRow>(client: PoolClient, sql: string, params: any[] = []): Promise<T[]> {
  const res: QueryResult<T> = (await client.query(sql, params)) as QueryResult<T>;
  return res.rows;
}

export async function exec(client: PoolClient, sql: string, params: any[] = []): Promise<void> {
  await client.query(sql, params);
}

// Direct query function for use in API routes
export async function query(sql: string, params: any[] = []): Promise<QueryResult> {
  if (!pool) {
    throw new Error('Database not configured. Please set DATABASE_URL environment variable.');
  }
  return pool.query(sql, params);
}


