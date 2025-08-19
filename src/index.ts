import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { connectMongo } from './db/mongo';
import { ensurePgVectorTable } from './db/postgres';

import authRoutes from './routes/auth';
import filesRoutes from './routes/files';
import searchRoutes from './routes/search';
import duplicatesRoutes from './routes/duplicates';
import folderRoutes from './routes/folders';
import shareRoutes from './routes/share';

dotenv.config();

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
};
app.use(cors(corsOptions));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use(limiter);

app.use('/auth', authRoutes);
app.use('/files', filesRoutes);
app.use('/folders', folderRoutes);
app.use('/search', searchRoutes);
app.use('/duplicates', duplicatesRoutes);
app.use('/share', shareRoutes);

app.get('/', (req, res) => res.send('SmartVault API is running!'));

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // <-- ADDED: Explicitly define the host for Render

(async () => {
  try {
    await connectMongo();
    await ensurePgVectorTable();
    // --- UPDATED: Use both HOST and PORT for listening ---
    app.listen(Number(PORT), HOST, () => {
      console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();