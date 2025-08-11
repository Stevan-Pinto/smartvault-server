import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import ShareLink from '../models/ShareLink';
import File from '../models/File';
import bcrypt from 'bcrypt'; // <-- Import bcrypt for password checking
import jwt from 'jsonwebtoken'; // <-- Import jwt for temporary download tokens

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Public route to get info for a shared file
router.get('/:token/info', async (req, res) => {
  try {
    const link = await ShareLink.findOne({ token: req.params.token }).populate('fileId');
    
    if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
      return res.status(404).json({ message: 'Link not found or has expired.' });
    }

    if (!link.fileId) {
      return res.status(404).json({ message: 'The file for this link has been deleted.' });
    }

    const file = link.fileId as any;
    res.json({
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        isPasswordProtected: !!link.passwordHash // <-- ADDED: Tells the frontend if a password is required
    });
  } catch (err) {
      console.error("Share info error:", err);
      res.status(500).json({ message: 'Server error' });
  }
});

// --- NEW FOR PHASE 3 ---
// Public route to verify a password and get a temporary download token
router.post('/:token/verify', async (req, res) => {
    try {
        const { password } = req.body;
        const link = await ShareLink.findOne({ token: req.params.token });

        if (!link || !link.passwordHash) {
            return res.status(400).json({ message: 'This link is not password protected.' });
        }

        const isMatch = await bcrypt.compare(password, link.passwordHash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password.' });
        }

        // If password is correct, issue a short-lived JWT that grants access to download
        const downloadToken = jwt.sign(
            { linkId: link._id }, 
            process.env.JWT_SECRET || 'secret', 
            { expiresIn: '15m' } // Grant access for 15 minutes
        );
        
        res.json({ downloadToken });

    } catch (err) {
        res.status(500).json({ message: 'Verification failed' });
    }
});

// --- UPDATED FOR PHASE 3 ---
// Public route to download a shared file
router.get('/:token/download', async (req, res) => {
  try {
    const link = await ShareLink.findOne({ token: req.params.token });

    if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
      return res.status(404).send('Link not found or has expired.');
    }

    const file = await File.findById(link.fileId);
    if (!file) {
      return res.status(404).send('The file for this link has been deleted.');
    }

    // New logic for password-protected files
    if (link.passwordHash) {
        const downloadToken = req.query.dt as string;
        if (!downloadToken) {
            return res.status(401).send('A password is required to download this file.');
        }

        try {
            jwt.verify(downloadToken, process.env.JWT_SECRET || 'secret');
        } catch (err) {
            return res.status(401).send('Your download session has expired. Please enter the password again.');
        }
    }

    const fullPath = path.join(UPLOAD_DIR, file.path);
    res.download(fullPath, file.filename);

  } catch (err) {
    console.error("Share download error:", err);
    res.status(500).send('Server error');
  }
});

export default router;  