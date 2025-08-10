import { Router } from 'express';
import auth, { AuthRequest } from '../middleware/auth';
import File from '../models/File';

const router = Router();

router.get('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const file = await File.findById(req.params.id).populate('duplicates.fileId', 'filename createdAt size');
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (file.ownerId.toString() !== req.userId) return res.status(403).json({ message: 'Forbidden' });
    res.json({ duplicates: file.duplicates || [] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get duplicates' });
  }
});

export default router;
