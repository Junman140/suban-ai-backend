/**
 * Convert MP4 buffer to GIF using FFmpeg.
 * Requires FFmpeg to be installed and available on PATH.
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function videoBufferToGifBuffer(mp4Buffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const id = `meme-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const mp4Path = path.join(tmpDir, `${id}.mp4`);
  const gifPath = path.join(tmpDir, `${id}.gif`);

  try {
    await fs.writeFile(mp4Path, mp4Buffer);
    await execFileAsync('ffmpeg', [
      '-i', mp4Path,
      '-vf', 'fps=10,scale=480:-1:flags=lanczos',
      '-y',
      gifPath,
    ], { timeout: 60000 });
    const gifBuffer = await fs.readFile(gifPath);
    return gifBuffer;
  } finally {
    await fs.unlink(mp4Path).catch(() => {});
    await fs.unlink(gifPath).catch(() => {});
  }
}

/** Check if FFmpeg is available on PATH. */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}
