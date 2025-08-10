import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import auth, { AuthRequest } from '../middleware/auth';
import Folder from '../models/Folder';
import File from '../models/File';

const router = Router();

// Create a new folder
router.post('/', auth, body('name').notEmpty(), async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, parentId } = req.body;
    
    // --- THIS IS THE FIX ---
    // Convert the string 'root' from the frontend into a proper null parentId
    const finalParentId = parentId === 'root' ? null : parentId || null;

    const folder = await Folder.create({ 
      ownerId: req.userId, 
      name, 
      parentId: finalParentId 
    });

    res.status(201).json(folder);
  } catch (err) {
    // This will now correctly catch duplicate folder names
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A folder with this name already exists here.' });
    }
    console.error("Folder creation error:", err); // Added for better server logs
    res.status(500).json({ message: 'Failed to create folder' });
  }
});

// List all folders for the user
router.get('/', auth, async (req: AuthRequest, res) => {
  try {
    const parentId = req.query.parentId || 'root';
    const folders = await Folder.find({ 
      ownerId: req.userId, 
      parentId: parentId === 'root' ? null : parentId 
    }).sort({ name: 1 });
    res.json(folders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to list folders' });
  }
});

// Delete a folder
router.delete('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    const filesInFolder = await File.countDocuments({ folderId: folder._id });
    if (filesInFolder > 0) {
      return res.status(400).json({ message: 'Cannot delete a folder that is not empty.' });
    }
    
    const subFolders = await Folder.countDocuments({ parentId: folder._id });
    if (subFolders > 0) {
        return res.status(400).json({ message: 'Cannot delete a folder with sub-folders.' });
    }

    await folder.deleteOne();
    res.json({ ok: true, message: 'Folder deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete folder' });
  }
});

export default router;