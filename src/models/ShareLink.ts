import { Schema, model, Types } from 'mongoose';
import { randomBytes } from 'crypto';

const ShareLinkSchema = new Schema({
  ownerId: { type: Types.ObjectId, required: true, ref: 'User' },
  fileId: { type: Types.ObjectId, required: true, ref: 'File' },
  token: { type: String, required: true, unique: true, default: () => randomBytes(20).toString('hex') },
  passwordHash: { type: String, default: null }, // <-- ADD THIS LINE
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

export default model('ShareLink', ShareLinkSchema);