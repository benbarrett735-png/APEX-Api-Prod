#!/usr/bin/env node
/**
 * Run database migrations on startup
 * This ensures the database schema is up-to-date before the API starts
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('🔄 Running database migrations...');

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get all migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Run in alphabetical order

    console.log(`📁 Found ${files.length} migration files`);

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name TEXT PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Run each migration
    for (const file of files) {
      const migrationName = file.replace('.sql', '');
      
      // Check if already run
      const result = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping ${file} (already run)`);
        continue;
      }

      console.log(`🔄 Running ${file}...`);
      
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      
      // Run migration in a transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        );
        await client.query('COMMIT');
        console.log(`✅ Completed ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        
        // Log the error but mark as completed if it's an "already exists" type error
        // This handles cases where the migration was partially applied
        if (err.code === '42710' || err.code === '42P07' || err.code === '42P16') {
          console.log(`⚠️  ${file} partially exists (${err.code}), marking as completed`);
          await client.query(
            'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
            [migrationName]
          );
        } else {
          throw err;
        }
      }
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

