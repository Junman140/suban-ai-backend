/**
 * Meme Studio API
 * GET  /api/meme/templates  - List crypto meme templates
 * POST /api/meme/generate  - Generate meme (image DALL-E, video/GIF LTX)
 * GET  /api/meme/file/:filename - Serve generated video/GIF file
 */

import path from 'path';
import { Router, Request, Response } from 'express';
import { getTemplates, generateMeme, MEME_STYLES, getGeneratedDir, isSafeGeneratedFilename } from '../services/meme.service';
import { memeRateLimiter } from '../middleware/rateLimit.middleware';
import fs from 'fs/promises';

const router = Router();

/**
 * GET /api/meme/templates
 * Returns list of crypto meme templates (no placeholder/mock data).
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = getTemplates();
    res.json(templates);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load templates';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/meme/generate
 * Body: { idea, templateId?, format?, style?, topText?, bottomText?, referenceUrl?, referenceType? }
 * Returns: { url, format }
 */
router.post('/generate', memeRateLimiter, async (req: Request, res: Response) => {
  try {
    const {
      idea,
      templateId,
      format,
      style,
      topText,
      bottomText,
      referenceUrl,
      referenceType,
    } = req.body;

    if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
      return res.status(400).json({ error: 'idea is required' });
    }

    const result = await generateMeme({
      idea: idea.trim(),
      templateId,
      format: format || 'image',
      style: style || 'Classic',
      topText,
      bottomText,
      referenceUrl,
      referenceType,
    });

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Meme generation failed';
    const status =
      message.includes('not configured') ? 503 :
      message.includes('Only image format') ? 400 :
      message.includes('Unsupported format') ? 400 :
      message.includes('FFmpeg') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/meme/file/:filename
 * Serve a generated meme file (video or GIF) by filename.
 */
router.get('/file/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    if (!filename || !isSafeGeneratedFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const dir = getGeneratedDir();
    const filePath = path.join(dir, filename);
    await fs.access(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.gif' ? 'image/gif' : 'video/mp4';
    res.setHeader('Content-Type', contentType);
    const buffer = await fs.readFile(filePath);
    res.send(buffer);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    const message = err instanceof Error ? err.message : 'Failed to serve file';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/meme/styles
 * Returns list of supported meme styles (for dropdowns).
 */
router.get('/styles', (_req: Request, res: Response) => {
  res.json(MEME_STYLES);
});

export default router;
