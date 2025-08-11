import { Schema, model, Types } from 'mongoose';

const DuplicateSchema = new Schema({
  fileId: { type: Types.ObjectId, ref: 'File' },
  score: { type: Number }
}, { _id: false });

const FileSchema = new Schema({
  ownerId: { type: Types.ObjectId, required: true, ref: 'User' },
  folderId: { type: Types.ObjectId, ref: 'Folder', default: null },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimeType: { type: String },
  size: { type: Number },
  tags: { type: [String], default: [] },
  summary: { type: String },
  content: { type: String }, // For full-text search
  duplicates: { type: [DuplicateSchema], default: [] }, // Corrected type
  createdAt: { type: Date, default: Date.now }
});

FileSchema.index({ content: 'text' });

export default model('File', FileSchema);