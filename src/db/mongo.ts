import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smartvault';
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
}
