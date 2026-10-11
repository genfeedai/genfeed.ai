import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/** Longest edge of the pixels compared with a palette; more adds cost, not signal. */
export const BRAND_PIXEL_MAX_EDGE = 256;
/** Longest edge of a frame handed to a vision model; text must stay legible. */
export const BRAND_ANALYSIS_MAX_EDGE = 1280;
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
export interface BrandEncodedVisual {
  decoder: string;
  /** PNG frames, longest edge at most `BRAND_ANALYSIS_MAX_EDGE`. */
  frames: readonly Uint8Array[];
}

const decoderLabel = () => `sharp/libvips-${sharp.versions.vips}`;

function openRaster(bytes: Uint8Array) {
  return sharp(Buffer.from(bytes), {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  });
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
    const source = openRaster(bytes);
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
      decoder: decoderLabel(),
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

/** Re-encodes a still as a PNG a vision model can read, or null when it is not a raster image. */
export async function encodeBrandAnalysisImage(
  bytes: Uint8Array,
): Promise<BrandEncodedVisual | null> {
  try {
    const source = openRaster(bytes);
    const metadata = await source.metadata();
    if (!metadata.format || !IMAGE_FORMATS.has(metadata.format)) return null;
    const png = await source
      .resize({
        fit: 'inside',
        height: BRAND_ANALYSIS_MAX_EDGE,
        width: BRAND_ANALYSIS_MAX_EDGE,
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .png()
      .toBuffer();
    return { decoder: decoderLabel(), frames: [new Uint8Array(png)] };
  } catch {
    return null;
  }
}

let ffmpegBinary: Promise<string | null> | null = null;
/**
 * The ffmpeg this process can run: the bundled `ffmpeg-static` binary (the server
 * image points it at the system ffmpeg through `FFMPEG_BIN`), else `ffmpeg` on PATH.
 * Resolved once; null when neither runs, which leaves video checks unknown.
 */
function resolveFfmpeg(): Promise<string | null> {
  ffmpegBinary ??= (async () => {
    for (const candidate of [ffmpegPath, 'ffmpeg']) {
      if (!candidate) continue;
      try {
        await execFileAsync(candidate, ['-version'], { timeout: 5_000 });
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  })();
  return ffmpegBinary;
}
/** Whether video frames can be decoded in this process. */
export async function isBrandVideoDecoderAvailable(): Promise<boolean> {
  return (await resolveFfmpeg()) !== null;
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
 * Samples evenly spaced frames of a video with the platform's ffmpeg, as PNGs
 * no wider than `BRAND_ANALYSIS_MAX_EDGE`. All frames must decode; a partial
 * sample proves nothing, so any gap (no binary, unknown duration, unreadable
 * container, timeout) returns null.
 */
export async function sampleBrandVideoPngFrames(
  bytes: Uint8Array,
): Promise<BrandEncodedVisual | null> {
  const binary = await resolveFfmpeg();
  if (!binary) return null;
  let directory: string | null = null;
  try {
    directory = await mkdtemp(join(tmpdir(), 'brand-video-'));
    const file = join(directory, 'input.bin');
    await writeFile(file, bytes);
    const duration = await readDurationSeconds(binary, file);
    if (duration === null) return null;
    const frames: Uint8Array[] = [];
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
          '-vf',
          `scale='min(${BRAND_ANALYSIS_MAX_EDGE},iw)':-2`,
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
      if (stdout.length === 0) return null;
      frames.push(new Uint8Array(stdout));
    }
    return { decoder: `ffmpeg+${decoderLabel()}`, frames };
  } catch {
    return null;
  } finally {
    if (directory) await rm(directory, { force: true, recursive: true });
  }
}
