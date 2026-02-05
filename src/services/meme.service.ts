/**
 * Meme Studio service: crypto meme templates and DALL-E image generation.
 * Video and GIF via LTX Studio. All communication uses the same request/response shapes as the API routes.
 */

import OpenAI from 'openai';
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
  return /^[a-zA-Z0-9-]+\.(mp4|gif)$/.test(name) && !name.includes('..');
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

export interface GenerateMemeParams {
  idea: string;
  templateId?: string;
  format?: MemeFormat;
  style?: string;
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Image generation is not configured. Set OPENAI_API_KEY on the server.');
  }

  const openai = new OpenAI({ apiKey });
  const prompt = buildMemePrompt(idea, templateName, style);

  logger.info('Meme generate request', { templateId: params.templateId, ideaLength: idea.length });

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'url',
  });

  const first = response.data?.[0];
  const imageUrl = first?.url;
  if (!imageUrl) {
    throw new Error('No image URL returned from generator');
  }

  return { url: imageUrl, format: 'image' };
}
