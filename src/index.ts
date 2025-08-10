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
app.use(cors());
app.use(express.json());

// Basic rate limiter — adjust for prod
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60
});
app.use(limiter);

app.use('/share', shareRoutes);
app.use('/auth', authRoutes);
app.use('/files', filesRoutes);
app.use('/folders', folderRoutes);
app.use('/search', searchRoutes);
app.use('/duplicates', duplicatesRoutes);

app.get('/', (req, res) => res.send('SmartVault API'));

const PORT = Number(process.env.PORT || 4000);

(async () => {
  try {
    await connectMongo();
    await ensurePgVectorTable();
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
