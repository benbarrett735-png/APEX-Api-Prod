import { Pool } from 'pg';

const ssl = process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined;
const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/nomadapex';
export const pool = new Pool({ connectionString: databaseUrl, ssl });


