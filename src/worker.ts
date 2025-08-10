import dotenv from 'dotenv';
import { connectMongo } from './db/mongo';
import { fileWorker } from './jobs/fileProcessor';
import { ensurePgVectorTable } from './db/postgres';

dotenv.config();

(async () => {
  try {
    await connectMongo();
    await ensurePgVectorTable();
    console.log('✅ Worker bootstrapped. Listening for jobs...');
  } catch (err) {
    console.error('Worker boot error:', err);
    process.exit(1);
  }
})();
