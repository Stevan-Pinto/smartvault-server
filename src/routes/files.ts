import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary'; // <-- ADDED for Cloudinary
import { CloudinaryStorage } from 'multer-storage-cloudinary'; // <-- ADDED for Cloudinary
import auth, { AuthRequest } from '../middleware/auth';
import File from '../models/File';
import { fileQueue } from '../jobs/queue';
import ShareLink from '../models/ShareLink';
import { add } from 'date-fns';
import bcrypt from 'bcrypt';

const router = Router();

// --- CONFIGURE CLOUDINARY FOR DEPLOYMENT ---
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'smartvault_uploads', // A folder in your Cloudinary account
        resource_type: 'auto'
    } as any
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- UPDATED FOR DEPLOYMENT ---
router.post('/upload', auth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { folderId } = req.body;
    
    const doc = await File.create({
      ownerId: req.userId,
      filename: req.file.originalname, // Use the original name for display
      path: req.file.path, // This is now the secure URL from Cloudinary
      mimeType: req.file.mimetype,
      size: req.file.size,
      folderId: folderId === 'root' ? null : folderId || null,
    });

    await fileQueue.add('process-file', { fileId: doc._id.toString() });
    res.status(201).json(doc);
  } catch (err) {
    console.error('Upload error', err);
    res.status(500).json({ message: 'Upload failed', error: err.message || err });
  }
});

router.get('/', auth, async (req: AuthRequest, res) => {
  try {
    const folderId = req.query.folderId || 'root';
    const hasDuplicates = req.query.hasDuplicates === 'true';
    const query: any = { ownerId: req.userId };
    if (req.query.folderId) {
        query.folderId = folderId === 'root' ? null : folderId;
    }
    if (hasDuplicates) {
        query['duplicates.0'] = { $exists: true };
    }
    const files = await File.find(query).sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Failed to list files' });
  }
});

// --- UPDATED FOR DEPLOYMENT ---
router.get('/:id/download', auth, async (req: AuthRequest, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.ownerId.toString() !== req.userId) {
        return res.status(404).json({ message: 'File not found' });
    }
    // Redirect the user's browser directly to the Cloudinary URL for download
    res.redirect(file.path);
  } catch (err) {
    res.status(500).json({ message: 'Download failed' });
  }
});

// --- UPDATED FOR DEPLOYMENT ---
router.delete('/:id', auth, async (req: AuthRequest, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.ownerId.toString() !== req.userId) {
        return res.status(404).json({ message: 'Not found' });
    }

    // Important: Delete the file from Cloudinary first
    // Cloudinary's public_id is the filename without the extension, inside the folder
    const publicId = `smartvault_uploads/${path.parse(file.path.split('/').pop()).name}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }); // Use 'raw' for non-image/video files like PDFs

    await file.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete error:", err)
    res.status(500).json({ message: 'Delete failed' });
  }
});

// --- UPDATED FOR DEPLOYMENT ---
router.get('/:id/preview', auth, async (req: AuthRequest, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.ownerId.toString() !== req.userId) {
        return res.status(404).json({ message: 'File not found' });
    }
    // Redirect to the Cloudinary URL, which can handle in-browser previews
    res.redirect(file.path);
  } catch (err) {
    res.status(500).json({ message: 'Preview failed' });
  }
});

// --- UPDATED FOR PHASE 3 ---
router.post('/:id/share', auth, async (req: AuthRequest, res) => {
  try {
    const { expiresIn, password } = req.body;
    const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!file) return res.status(404).json({ message: 'File not found' });

    let expiresAt = null;
    if (expiresIn) {
        const duration = parseInt(expiresIn.slice(0, -1));
        const unit = expiresIn.slice(-1);
        const now = new Date();
        if (unit === 'd') expiresAt = add(now, { days: duration });
        if (unit === 'h') expiresAt = add(now, { hours: duration });
    }

    let passwordHash = null;
    if (password) {
        passwordHash = await bcrypt.hash(password, 10);
    }

    const link = await ShareLink.create({
      ownerId: req.userId,
      fileId: file._id,
      expiresAt: expiresAt,
      passwordHash: passwordHash
    });

    res.status(201).json(link);
  } catch(err) {
    res.status(500).json({ message: 'Could not create share link' });
  }
});

router.get('/:id/shares', auth, async (req: AuthRequest, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!file) return res.status(404).json({ message: 'File not found' });
        const links = await ShareLink.find({ fileId: file._id });
        res.json(links);
    } catch (err) {
        res.status(500).json({ message: 'Could not retrieve share links' });
    }
});

router.delete('/shares/:linkId', auth, async (req: AuthRequest, res) => {
    try {
        const link = await ShareLink.findOne({ _id: req.params.linkId, ownerId: req.userId });
        if (!link) return res.status(404).json({ message: 'Link not found' });
        await link.deleteOne();
        res.json({ ok: true });
    } catch(err) {
        res.status(500).json({ message: 'Could not revoke share link' });
    }
});

router.post('/delete-batch', auth, async (req: AuthRequest, res) => {
    try {
        const { fileIds } = req.body;
        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({ message: 'File IDs must be a non-empty array' });
        }

        const files = await File.find({ _id: { $in: fileIds }, ownerId: req.userId });

        for (const file of files) {
            const publicId = `smartvault_uploads/${path.parse(file.path.split('/').pop()).name}`;
            await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        }

        await File.deleteMany({ _id: { $in: files.map(f => f._id) }, ownerId: req.userId });
        res.json({ ok: true, message: `${files.length} files deleted.` });
    } catch (err) {
        res.status(500).json({ message: 'Batch delete failed' });
    }
});

export default router;