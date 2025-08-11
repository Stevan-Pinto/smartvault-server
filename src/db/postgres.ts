import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pgPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DB || 'postgres',
  // --- THIS IS THE FINAL FIX ---
  // Heroku and other cloud platforms often require an explicit SSL connection.
  ssl: {
    rejectUnauthorized: false 
  }
});

export async function ensurePgVectorTable() {
  try {
    // Create extension + table if not exists
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
    // Throw the error to let the startup process know something is wrong
    throw err;
  }
}