/**
 * Meme Studio video generation via LTX Studio (LTX-2).
 * Text-to-video and image-to-video; used for format 'video' and as source for GIF.
 */

import logger from '../utils/logger';

const LTX_BASE = 'https://api.ltx.video/v1';
const MEME_VIDEO_DURATION = 6;
const MEME_VIDEO_RESOLUTION = '1920x1080';
const MEME_VIDEO_MODEL = 'ltx-2-fast';

export interface GenerateMemeVideoParams {
  idea: string;
  referenceUrl?: string;
  style?: string;
}

export interface GenerateMemeVideoResult {
  buffer: Buffer;
  format: 'video';
}

function getApiKey(): string {
  const key = process.env.LTX_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('Video generation is not configured. Set LTX_API_KEY on the server.');
  }
  return key.trim();
}

function buildVideoPrompt(idea: string, style?: string): string {
  const styleHint = style ? `, ${style} crypto meme style` : '';
  return `Short crypto meme clip. Theme: ${idea}. Style: internet meme, punchy, loop-friendly${styleHint}. Suitable for cryptocurrency, Solana, or trading humor.`;
}

/**
 * Generate a short meme video (MP4) from text prompt, optionally using an image as first frame.
 */
export async function generateMemeVideo(params: GenerateMemeVideoParams): Promise<GenerateMemeVideoResult> {
  const apiKey = getApiKey();
  const prompt = buildVideoPrompt(params.idea, params.style);
  const hasImage = Boolean(params.referenceUrl?.trim());

  const url = hasImage ? `${LTX_BASE}/image-to-video` : `${LTX_BASE}/text-to-video`;
  const body: Record<string, unknown> = {
    prompt,
    model: MEME_VIDEO_MODEL,
    duration: MEME_VIDEO_DURATION,
    resolution: MEME_VIDEO_RESOLUTION,
    fps: 25,
    generate_audio: false,
  };
  if (hasImage) {
    body.image_uri = params.referenceUrl!.trim();
  }

  logger.info('Meme video generate request', { ideaLength: params.idea.length, imageToVideo: hasImage });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `LTX API error ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.error?.message) message = json.error.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    logger.error('LTX video generation failed', { status: response.status, message });
    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, format: 'video' };
}
