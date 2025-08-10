import { Router } from 'express';
import OpenAI from 'openai';
import auth, { AuthRequest } from '../middleware/auth';
import { pgPool } from '../db/postgres';
import File from '../models/File';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get('/', auth, async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Query is required' });

    // --- Step 1: Full-Text Search using MongoDB ---
    const textSearchResults = await File.find(
      { 
        ownerId: req.userId,
        $text: { $search: q } 
      },
      { score: { $meta: 'textScore' } } // Project the relevance score
    ).sort({ score: { $meta: 'textScore' } }).limit(10);


    // --- Step 2: Semantic Search using pgvector (existing logic) ---
    const embedResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: q
    });
    const queryEmbedding = embedResp.data[0].embedding;

    const { rows } = await pgPool.query(
      `SELECT file_id, 1 - (embedding <=> $1) AS similarity
       FROM file_vectors
       ORDER BY similarity DESC
       LIMIT 10`,
      [JSON.stringify(queryEmbedding)]
    );
    
    const semanticSearchFileIds = rows.map((r: any) => r.file_id);
    const semanticSearchResults = await File.find({ 
        _id: { $in: semanticSearchFileIds }, 
        ownerId: req.userId 
    });


    // --- Step 3: Combine and Deduplicate Results ---
    const combinedResults = new Map();

    // Add text search results first
    textSearchResults.forEach(file => combinedResults.set(file._id.toString(), file));

    // Add semantic search results, avoiding duplicates
    semanticSearchResults.forEach(file => {
        if (!combinedResults.has(file._id.toString())) {
            combinedResults.set(file._id.toString(), file);
        }
    });

    const finalResults = Array.from(combinedResults.values());

    res.json({ results: finalResults });

  } catch (err) {
    console.error('Search error', err);
    res.status(500).json({ message: 'Search failed' });
  }
});

export default router;