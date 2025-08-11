import { Worker } from 'bullmq';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';
import File from '../models/File';
import { pgPool } from '../db/postgres';
import dotenv from 'dotenv';
import axios from 'axios';
import { Types } from 'mongoose'; // <-- ADD THIS IMPORT for correct typing

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- UPDATED FOR DEPLOYMENT ---
// Parse the Redis URL to create a connection object that matches BullMQ's expected type
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
  // Add TLS for secure connections to services like Upstash
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined, 
};

const DUPLICATE_THRESHOLD = 0.88;

export const fileWorker = new Worker(
  'file-processing',
  async job => {
    const fileId = job.data.fileId;
    const fileDoc = await File.findById(fileId);
    if (!fileDoc) return;

    const fileUrl = fileDoc.path; 
    let extractedText = '';

    try {
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        if (fileDoc.mimeType?.includes('pdf')) {
            const data = await pdfParse(buffer);
            extractedText = data.text || '';
        } else if (fileDoc.mimeType?.startsWith('image/')) {
            const { data: tdata } = await Tesseract.recognize(buffer, 'eng');
            extractedText = tdata?.text || '';
        } else {
            extractedText = buffer.toString('utf8');
        }
    } catch (err) {
      console.error(`Failed to process file from URL ${fileUrl}:`, err);
    }

    fileDoc.content = extractedText;

    try {
      const prompt = `Summarize the following document in 3 sentences and list up to 6 tags (comma separated).\n\n${extractedText.substring(0, 4000)}`;
      const chat = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      });
      const content = chat.choices?.[0]?.message?.content || '';
      const parts = content.split('Tags:');
      const summary = (parts[0] || '').trim();
      const tags = (parts[1] || '')
        .split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 6);
      fileDoc.summary = summary;
      fileDoc.tags = tags;
    } catch (err) {
      console.error('AI summary/tags error:', err);
    }

    let embedding: number[] = [];
    try {
      const embResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: (extractedText || fileDoc.filename).substring(0, 8000)
      });
      embedding = embResp.data[0].embedding;
      await pgPool.query(
        'INSERT INTO file_vectors (file_id, embedding) VALUES ($1, $2) ON CONFLICT (file_id) DO UPDATE SET embedding = EXCLUDED.embedding',
        [fileDoc._id.toString(), JSON.stringify(embedding)]
      );
    } catch (err) {
      console.error('Embedding error:', err);
    }

    try {
      if (embedding.length > 0) {
        const { rows } = await pgPool.query(
          `SELECT file_id, 1 - (embedding <=> $2) AS similarity FROM file_vectors WHERE file_id <> $1 ORDER BY similarity DESC LIMIT 5`,
          [fileDoc._id.toString(), JSON.stringify(embedding)]
        );

        const possible: { fileId: Types.ObjectId; score: number }[] = [];
        for (const r of rows) {
          const candidate = await File.findById(r.file_id);
          if (!candidate || candidate.ownerId.toString() !== fileDoc.ownerId.toString()) continue;
          if (r.similarity >= DUPLICATE_THRESHOLD) {
            possible.push({ fileId: candidate._id, score: r.similarity });
          }
        }
        
        // --- THIS IS THE FIX FOR THE DUPLICATES ARRAY TYPE ERROR ---
        fileDoc.duplicates = possible as any;

        for (const p of possible) {
          await File.updateOne(
            { _id: p.fileId },
            { $addToSet: { duplicates: { fileId: fileDoc._id, score: p.score } } }
          );
        }
      }
    } catch (err) {
      console.error('Duplicate detection error:', err);
    }

    await fileDoc.save();
    return { fileId: fileDoc._id.toString() };
  },
  { connection: connection } // Use the corrected connection object
);