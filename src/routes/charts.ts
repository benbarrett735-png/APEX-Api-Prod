/**
 * Charts Router
 * Serves generated chart images
 * Per Kevin's plan: API serves files, Portal proxies with auth
 */
import { Router } from 'express';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// Apply auth middleware
router.use(requireAuth);

/**
 * Serve chart image
 */
router.get('/serve/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    
    // Validate fileName (prevent path traversal)
    if (!fileName || fileName.includes('..') || fileName.includes('/')) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    
    // Ensure it's a PNG file
    if (!fileName.endsWith('.png')) {
      return res.status(400).json({ error: 'Only PNG files are supported' });
    }
    
    const filePath = join(process.cwd(), 'public', 'charts', fileName);
    
    // Read and serve the file
    const fileBuffer = await readFile(filePath);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.send(fileBuffer);
    
  } catch (error: any) {
    console.error('[Charts] Error serving chart:', error);
    
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Chart not found' });
    }
    
    res.status(500).json({ error: 'Failed to serve chart' });
  }
});

export default router;

