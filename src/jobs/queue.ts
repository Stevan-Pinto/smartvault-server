import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

// Use a single environment variable for the full Redis URL
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const fileQueue = new Queue('file-processing', { 
  connection: redisUrl 
});