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

// --- THIS IS THE FIX FOR THE CORS ERROR ---
// Explicitly configure CORS to allow your Vercel frontend URL
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Use an env variable for production
};
app.use(cors(corsOptions));
// ------------------------------------------

app.use(express.json());

// A more reasonable rate limit for a deployed application
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200 // limit each IP to 200 requests per windowMs
});
app.use(limiter);

// Register all your application routes
app.use('/auth', authRoutes);
app.use('/files', filesRoutes);
app.use('/folders', folderRoutes);
app.use('/search', searchRoutes);
app.use('/duplicates', duplicatesRoutes);
app.use('/share', shareRoutes);


app.get('/', (req, res) => res.send('SmartVault API is running!'));

const PORT = process.env.PORT || 4000;

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