import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/** Longest edge analyzed; pixels beyond this add cost, not signal. */
export const BRAND_PIXEL_MAX_EDGE = 256;
/** Frames sampled evenly across a video. */
export const BRAND_VIDEO_SAMPLE_FRAMES = 4;
const MAX_INPUT_PIXELS = 50_000_000;
const FFMPEG_TIMEOUT_MS = 20_000;
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);
const VIDEO_FORMATS = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm';

export interface BrandPixelFrame {
  width: number;
  height: number;
  /** Raw 8-bit sRGB RGBA, row-major. */
  rgba: Uint8Array;
}
export interface BrandDecodedVisual {
  /** The decoder that produced these pixels, recorded in the proof. */
  decoder: string;
  frames: readonly BrandPixelFrame[];
}

/**
 * Decodes a still image to bounded sRGB RGBA. Returns null for anything the
 * decoder cannot read as a raster image (vector, document or corrupt input), so
 * the caller leaves the check unknown instead of guessing.
 */
export async function decodeBrandImage(
  bytes: Uint8Array,
): Promise<BrandDecodedVisual | null> {
  try {
    const source = sharp(Buffer.from(bytes), {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const metadata = await source.metadata();
    if (!metadata.format || !IMAGE_FORMATS.has(metadata.format)) return null;
    const { data, info } = await source
      .resize({
        fit: 'inside',
        height: BRAND_PIXEL_MAX_EDGE,
        kernel: 'nearest',
        width: BRAND_PIXEL_MAX_EDGE,
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4 || info.width < 1 || info.height < 1) return null;
    return {
      decoder: `sharp/libvips-${sharp.versions.vips}`,
      frames: [
        {
          height: info.height,
          rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
          width: info.width,
        },
      ],
    };
  } catch {
    return null;
  }
}

async function readDurationSeconds(
  binary: string,
  file: string,
): Promise<number | null> {
  try {
    await execFileAsync(
      binary,
      [
        '-hide_banner',
        '-nostdin',
        '-protocol_whitelist',
        'file',
        '-format_whitelist',
        VIDEO_FORMATS,
        '-i',
        file,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
    return null;
  } catch (error) {
    // ffmpeg without an output exits 1 and prints the container info on stderr.
    const stderr =
      error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    const match = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
    if (!match) return null;
    const seconds =
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
}

/**
 * Decodes evenly spaced frames of a video with the platform's ffmpeg. All
 * frames must decode; a partial sample proves nothing, so any gap (no binary,
 * unknown duration, unreadable container, timeout) returns null.
 */
export async function sampleBrandVideoFrames(
  bytes: Uint8Array,
): Promise<BrandDecodedVisual | null> {
  const binary = ffmpegPath;
  if (!binary) return null;
  let directory: string | null = null;
  try {
    directory = await mkdtemp(join(tmpdir(), 'brand-video-'));
    const file = join(directory, 'input.bin');
    await writeFile(file, bytes);
    const duration = await readDurationSeconds(binary, file);
    if (duration === null) return null;
    const frames: BrandPixelFrame[] = [];
    let decoder = '';
    for (let index = 0; index < BRAND_VIDEO_SAMPLE_FRAMES; index++) {
      const at = (duration * (index + 0.5)) / BRAND_VIDEO_SAMPLE_FRAMES;
      const { stdout } = await execFileAsync(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file',
          '-format_whitelist',
          VIDEO_FORMATS,
          '-ss',
          at.toFixed(3),
          '-i',
          file,
          '-frames:v',
          '1',
          '-an',
          '-f',
          'image2pipe',
          '-c:v',
          'png',
          'pipe:1',
        ],
        {
          encoding: 'buffer',
          maxBuffer: MAX_FRAME_BYTES,
          timeout: FFMPEG_TIMEOUT_MS,
        },
      );
      const decoded = await decodeBrandImage(stdout);
      const frame = decoded?.frames[0];
      if (!decoded || !frame) return null;
      decoder = decoded.decoder;
      frames.push(frame);
    }
    return { decoder: `ffmpeg+${decoder}`, frames };
  } catch {
    return null;
  } finally {
    if (directory) await rm(directory, { force: true, recursive: true });
  }
}
