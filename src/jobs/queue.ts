import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
  // --- THIS IS THE FIX ---
  // Upstash requires an explicit TLS object for stable connections from some platforms
  tls: {
    rejectUnauthorized: false
  },
};

export const fileQueue = new Queue('file-processing', { 
  connection: connection 
});