import { Worker } from 'bullmq';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';
import File from '../models/File';
import { pgPool } from '../db/postgres';
import dotenv from 'dotenv';
import axios from 'axios'; // <-- ADDED: To download files from Cloudinary

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- UPDATED FOR DEPLOYMENT ---
// Use a single environment variable for the full Redis URL from Upstash
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const DUPLICATE_THRESHOLD = 0.88;

export const fileWorker = new Worker(
  'file-processing',
  async job => {
    const fileId = job.data.fileId;
    const fileDoc = await File.findById(fileId);
    if (!fileDoc) return;

    // --- THIS LOGIC IS NEW ---
    // Instead of a local path, the worker now fetches the file from the Cloudinary URL.
    const fileUrl = fileDoc.path; 
    let extractedText = '';

    try {
        // Use axios to get the file as a buffer from the URL
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        if (fileDoc.mimeType?.includes('pdf')) {
            const data = await pdfParse(buffer);
            extractedText = data.text || '';
        } else if (fileDoc.mimeType?.startsWith('image/')) {
            const { data: tdata } = await Tesseract.recognize(buffer, 'eng');
            extractedText = tdata?.text || '';
        } else {
            // For plain text files, etc.
            extractedText = buffer.toString('utf8');
        }
    } catch (err) {
      console.error(`Failed to process file from URL ${fileUrl}:`, err);
    }

    // Save the extracted content for full-text search
    fileDoc.content = extractedText;

    // --- The rest of the logic remains the same ---

    // AI summary & tags
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
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 6);

      fileDoc.summary = summary;
      fileDoc.tags = tags;
    } catch (err) {
      console.error('AI summary/tags error:', err);
    }

    // Embedding
    let embedding: number[] = [];
    try {
      const embResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: (extractedText || fileDoc.filename).substring(0, 3000)
      });
      embedding = embResp.data[0].embedding;
      await pgPool.query(
        'INSERT INTO file_vectors (file_id, embedding) VALUES ($1, $2) ON CONFLICT (file_id) DO UPDATE SET embedding = EXCLUDED.embedding',
        [fileDoc._id.toString(), JSON.stringify(embedding)]
      );
    } catch (err) {
      console.error('Embedding error:', err);
    }

    // Duplicate detection
    try {
      if (embedding.length > 0) {
        const { rows } = await pgPool.query(
          `SELECT file_id, 1 - (embedding <=> $2) AS similarity
           FROM file_vectors
           WHERE file_id <> $1
           ORDER BY similarity DESC
           LIMIT 5`,
          [fileDoc._id.toString(), JSON.stringify(embedding)]
        );

        const possible: { fileId: any; score: number }[] = [];
        for (const r of rows) {
          const candidate = await File.findById(r.file_id);
          if (!candidate || candidate.ownerId.toString() !== fileDoc.ownerId.toString()) continue;
          if (r.similarity >= DUPLICATE_THRESHOLD) {
            possible.push({ fileId: candidate._id, score: r.similarity });
          }
        }
        fileDoc.duplicates = possible;
        
        // Reciprocal updates
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

    // Save all updates (content, summary, tags, duplicates) at once
    await fileDoc.save();

    return { fileId: fileDoc._id.toString() };
  },
  { connection: redisUrl } // Use the full URL for the connection
);