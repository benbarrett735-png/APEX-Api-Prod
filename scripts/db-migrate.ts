import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { config } from 'dotenv';

async function main() {
  // Get the directory of this script file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Load .env file from apps/api directory
  const envPath = join(__dirname, '..', '.env');
  config({ path: envPath });

  console.log('DATABASE_URL loaded:', !!process.env.DATABASE_URL);
  console.log('PGSSL:', process.env.PGSSL);

  // Migrations are in ../migrations relative to this script
  const dir = join(__dirname, '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE IF NOT EXISTS migrations(id text primary key, applied_at timestamptz default now())');
    for (const f of files) {
      const id = f;
      const { rows } = await client.query('SELECT 1 FROM migrations WHERE id=$1', [id]);
      if (rows.length) continue;
      const sql = readFileSync(join(dir, f), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO migrations(id) VALUES($1)', [id]);
      // eslint-disable-next-line no-console
      console.log('Applied', id);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();


