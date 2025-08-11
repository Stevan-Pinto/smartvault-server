import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

// --- UPDATED FOR DEPLOYMENT ---
// Parse the Redis URL to create a connection object
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
  // Add this for Upstash which requires TLS
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
};

export const fileQueue = new Queue('file-processing', { 
  connection: connection 
});