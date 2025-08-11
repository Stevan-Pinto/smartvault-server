import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// --- THIS IS THE FINAL FIX ---
// We now use a single DATABASE_URL variable that will hold the entire
// connection pooler string from Supabase. This is the most robust method.
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function ensurePgVectorTable() {
  try {
    // This logic remains the same
    await pgPool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS file_vectors (
        file_id TEXT PRIMARY KEY,
        embedding vector(1536)
      );
    `);
    console.log('✅ Postgres (pgvector) ready');
  } catch (err) {
    console.error("Postgres init error:", err)
    throw err;
  }
}