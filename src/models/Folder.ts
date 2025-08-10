import { Schema, model, Types } from 'mongoose';

const FolderSchema = new Schema({
  ownerId: { type: Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true },
  parentId: { type: Types.ObjectId, ref: 'Folder', default: null },
  createdAt: { type: Date, default: Date.now }
});

FolderSchema.index({ ownerId: 1, parentId: 1, name: 1 }, { unique: true });

export default model('Folder', FolderSchema);