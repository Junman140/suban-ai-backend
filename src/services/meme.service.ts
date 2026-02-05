/**
 * Meme Studio service: crypto meme templates and image generation (Gemini + Reve).
 * Video and GIF via LTX Studio. All communication uses the same request/response shapes as the API routes.
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { generateMemeVideo } from './meme-video.service';
import { videoBufferToGifBuffer, isFfmpegAvailable } from '../utils/videoToGif';

const GENERATED_DIR = path.join(process.cwd(), 'generated');

async function ensureGeneratedDir(): Promise<void> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

function safeFilename(name: string): boolean {
  return /^[a-zA-Z0-9-]+\.(mp4|gif|png|jpg|jpeg)$/.test(name) && !name.includes('..');
}

export function getGeneratedDir(): string {
  return GENERATED_DIR;
}

export function isSafeGeneratedFilename(name: string): boolean {
  return safeFilename(name);
}

export type MemeFormat = 'image' | 'gif' | 'video';

export interface TextLayout {
  top?: { x: number; y: number; fontSize: number; maxWidth: number };
  bottom?: { x: number; y: number; fontSize: number; maxWidth: number };
  single?: { x: number; y: number; fontSize: number; maxWidth: number };
}

export interface MemeTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string | null;
  format: MemeFormat;
  layout: TextLayout;
  defaultTopText?: string;
  defaultBottomText?: string;
  referenceUrl?: string;
  style?: string;
}

export const MEME_STYLES = ['Classic', 'DeFi', 'NGMI', 'WAGMI', 'Stonks', 'Diamond Hands'] as const;

/** Image provider options for meme generation (image format only). */
export const MEME_IMAGE_PROVIDERS: { value: ImageProvider; label: string }[] = [
  { value: 'gemini', label: 'Gemini (Flash 2.5 / Pro)' },
  { value: 'reve', label: 'Reve AI' },
];

const TEMPLATES: MemeTemplate[] = [
  {
    id: 'drake',
    name: 'Drake',
    description: 'Drake rejecting vs accepting (crypto version)',
    thumbnail: null,
    format: 'image',
    layout: {
      top: { x: 0.5, y: 0.25, fontSize: 28, maxWidth: 0.9 },
      bottom: { x: 0.5, y: 0.78, fontSize: 28, maxWidth: 0.9 },
    },
    defaultTopText: 'Using CEX',
    defaultBottomText: 'Using Phantom on Solana',
    style: 'Classic',
  },
  {
    id: 'distracted-boyfriend',
    name: 'Distracted Boyfriend',
    description: 'Boyfriend, girlfriend, and distraction',
    thumbnail: null,
    format: 'image',
    layout: {
      top: { x: 0.5, y: 0.08, fontSize: 24, maxWidth: 0.95 },
      bottom: { x: 0.5, y: 0.92, fontSize: 24, maxWidth: 0.95 },
    },
    defaultTopText: 'My portfolio',
    defaultBottomText: 'SOL at $500',
    style: 'Stonks',
  },
  {
    id: 'this-is-fine',
    name: 'This Is Fine',
    description: 'Dog in burning room',
    thumbnail: null,
    format: 'image',
    layout: {
      single: { x: 0.5, y: 0.85, fontSize: 22, maxWidth: 0.85 },
    },
    defaultBottomText: 'This is fine (market -40%)',
    style: 'NGMI',
  },
  {
    id: 'stonks',
    name: 'Stonks',
    description: 'Stonks guy',
    thumbnail: null,
    format: 'image',
    layout: {
      top: { x: 0.5, y: 0.12, fontSize: 26, maxWidth: 0.9 },
      bottom: { x: 0.5, y: 0.88, fontSize: 26, maxWidth: 0.9 },
    },
    defaultTopText: 'Buying the dip',
    defaultBottomText: 'Stonks only go up',
    style: 'Stonks',
  },
  {
    id: 'buff-doge',
    name: 'Buff Doge',
    description: 'Buff Doge vs Cheems',
    thumbnail: null,
    format: 'image',
    layout: {
      top: { x: 0.5, y: 0.15, fontSize: 24, maxWidth: 0.9 },
      bottom: { x: 0.5, y: 0.82, fontSize: 24, maxWidth: 0.9 },
    },
    defaultTopText: 'DeFi degens',
    defaultBottomText: 'Solana validators',
    style: 'Diamond Hands',
  },
  {
    id: 'two-buttons',
    name: 'Two Buttons',
    description: 'Two buttons / difficult choice',
    thumbnail: null,
    format: 'image',
    layout: {
      top: { x: 0.5, y: 0.1, fontSize: 22, maxWidth: 0.9 },
      bottom: { x: 0.5, y: 0.9, fontSize: 22, maxWidth: 0.9 },
    },
    defaultTopText: 'Sell SOL',
    defaultBottomText: 'Buy more SOL',
    style: 'WAGMI',
  },
  {
    id: 'custom',
    name: 'Custom (AI only)',
    description: 'No template – AI generates from your idea',
    thumbnail: null,
    format: 'image',
    layout: { single: { x: 0.5, y: 0.5, fontSize: 32, maxWidth: 0.9 } },
    style: 'Classic',
  },
];

const MAX_IDEA_LENGTH = 500;

function buildMemePrompt(idea: string, templateName: string, style: string): string {
  const styleHint = MEME_STYLES.includes(style as any) ? `, ${style} crypto meme style` : '';
  return `Create a single panel crypto meme image. Theme: ${idea}. Meme format inspiration: ${templateName}. Style: internet meme, bold text areas, high contrast${styleHint}. No text in the image (text will be overlaid separately). Suitable for cryptocurrency, Solana, or trading humor.`;
}

export function getTemplates(): MemeTemplate[] {
  return TEMPLATES;
}

export type ImageProvider = 'gemini' | 'reve';

/** Gemini model for image gen: flash (free/fast) or pro. */
export type GeminiImageModel = 'flash' | 'pro';

export interface GenerateMemeParams {
  idea: string;
  templateId?: string;
  format?: MemeFormat;
  style?: string;
  imageProvider?: ImageProvider;
  geminiModel?: GeminiImageModel;
  topText?: string;
  bottomText?: string;
  referenceUrl?: string;
  referenceType?: 'image' | 'gif' | 'video';
}

export interface GenerateMemeResult {
  url: string;
  format: string;
}

export async function generateMeme(params: GenerateMemeParams): Promise<GenerateMemeResult> {
  const format = params.format || 'image';

  if (format === 'image') {
    return generateMemeImage(params);
  }

  if (format === 'video' || format === 'gif') {
    const idea = params.idea.trim().slice(0, MAX_IDEA_LENGTH);
    const { buffer } = await generateMemeVideo({
      idea,
      referenceUrl: params.referenceUrl,
      style: params.style,
    });

    await ensureGeneratedDir();
    const id = uuidv4();

    if (format === 'video') {
      const filename = `${id}.mp4`;
      await fs.writeFile(path.join(GENERATED_DIR, filename), buffer);
      return { url: `/api/meme/file/${filename}`, format: 'video' };
    }

    const available = await isFfmpegAvailable();
    if (!available) {
      throw new Error('GIF conversion requires FFmpeg. Install FFmpeg on the server or use format: "video".');
    }
    const gifBuffer = await videoBufferToGifBuffer(buffer);
    const filename = `${id}.gif`;
    await fs.writeFile(path.join(GENERATED_DIR, filename), gifBuffer);
    return { url: `/api/meme/file/${filename}`, format: 'gif' };
  }

  throw new Error(`Unsupported format: ${format}. Use image, video, or gif.`);
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Flash = free/fast (Nano Banana), Pro = higher quality. */
const GEMINI_IMAGE_MODELS = { flash: 'gemini-2.0-flash-exp-image-generation', pro: 'gemini-1.5-pro' } as const;

async function generateMemeImageGemini(prompt: string, model: GeminiImageModel): Promise<string> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini image generation is not configured. Set GOOGLE_GEMINI_API_KEY on the server.');
  }
  const modelId = GEMINI_IMAGE_MODELS[model];
  const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      responseMimeType: 'text/plain',
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `Gemini API error ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.error?.message) message = json.error.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error('No image data returned from Gemini');
  }
  const mimeType = imagePart.inlineData.mimeType ?? 'image/png';
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  await ensureGeneratedDir();
  const filename = `${uuidv4()}.${ext}`;
  await fs.writeFile(path.join(GENERATED_DIR, filename), buffer);
  return `/api/meme/file/${filename}`;
}

const REVE_API_BASE = 'https://api.reveai.org/v1';

async function generateMemeImageReve(prompt: string): Promise<string> {
  const apiKey = process.env.REVE_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Reve image generation is not configured. Set REVE_API_KEY on the server.');
  }
  const response = await fetch(`${REVE_API_BASE}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      width: 1024,
      height: 1024,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `Reve API error ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) message = json.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  const data = (await response.json()) as { status?: string; image_url?: string };
  const imageUrl = data?.image_url;
  if (!imageUrl) {
    throw new Error('No image URL returned from Reve');
  }
  return imageUrl;
}

export async function generateMemeImage(params: GenerateMemeParams): Promise<GenerateMemeResult> {
  const idea = params.idea.trim().slice(0, MAX_IDEA_LENGTH);
  const format = params.format || 'image';

  if (format !== 'image') {
    throw new Error('Only image format is supported. GIF and video coming soon.');
  }

  const template = params.templateId
    ? TEMPLATES.find((t) => t.id === params.templateId)
    : TEMPLATES.find((t) => t.id === 'custom');
  const templateName = template?.name ?? 'Custom';
  const style = params.style ?? 'Classic';
  const prompt = buildMemePrompt(idea, templateName, style);
  const provider = params.imageProvider ?? 'gemini';
  const geminiModel = params.geminiModel ?? 'flash';

  logger.info('Meme generate request', { templateId: params.templateId, ideaLength: idea.length, imageProvider: provider, geminiModel: provider === 'gemini' ? geminiModel : undefined });

  if (provider === 'reve') {
    const imageUrl = await generateMemeImageReve(prompt);
    return { url: imageUrl, format: 'image' };
  }

  const imageUrl = await generateMemeImageGemini(prompt, geminiModel);
  return { url: imageUrl, format: 'image' };
}
