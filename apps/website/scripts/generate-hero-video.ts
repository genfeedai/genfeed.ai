/**
 * Hero background video pipeline — generate, encode, poster, publish.
 *
 * The homepage hero plays a short, silent, looping clip behind the headline.
 * The clip is *itself* Genfeed output: it is generated through the same
 * Replicate provider the product uses, so the marketing surface is not making a
 * claim the product cannot back. Nothing about this file runs at request time
 * or at build time — it is an operator script, run by hand, whose only artefacts
 * are the files it uploads to the CDN.
 *
 * The pipeline, in order:
 *
 *   1. generate  — Replicate text-to-video → one raw MP4
 *   2. encode    — H.264 MP4 (Safari/iOS, `+faststart`) and VP9 WebM (Chrome/FF)
 *   3. poster    — frame 0 of the *encoded MP4*, as WebP + JPEG
 *   4. upload    — s3://cdn.genfeed.ai/assets/branding/website/home/hero/**
 *
 * Step 3 is why the poster is extracted from the encoded output rather than from
 * the raw download: the browser paints `poster` until the first decoded frame is
 * ready, so the poster has to be the byte-identical first frame of the file the
 * browser actually plays. Extracting it from a different encode leaves a visible
 * flash on the handoff — the exact seam this script exists to remove.
 *
 * Usage:
 *     bun run scripts/generate-hero-video.ts --dry-run       # print the plan, spend nothing
 *     bun run scripts/generate-hero-video.ts                 # generate + encode locally
 *     bun run scripts/generate-hero-video.ts --upload        # …and publish to the CDN
 *     bun run scripts/generate-hero-video.ts --from ./raw.mp4  # re-encode, skip Replicate
 *
 * Credentials come from the repo `.env.local` (REPLICATE_KEY, AWS_*); this
 * script never prints them. Requires `ffmpeg` and `ffprobe` on PATH.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const logger = {
  error: (message: string) => console.error(`[hero-video] ${message}`),
  log: (message: string) => console.log(`[hero-video] ${message}`),
};

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Seedance 1 Pro renders coherent human motion at 1080p without the plastic
 * "AI b-roll" look, and returns a plain MP4 URL rather than a frame sequence.
 * Pinned by name, not by version hash: Replicate resolves the owner/name form
 * to the current version, and a hero clip is regenerated deliberately, never
 * on a schedule that a stale pin would silently break.
 */
const MODEL = 'bytedance/seedance-1-pro';

/**
 * UGC, not stock. The shot has to read as a creator's own phone footage — the
 * thing a Genfeed customer publishes — while staying legible behind white type:
 * one continuous camera move, no cuts, no on-screen text, and a dark enough
 * frame that the overlay does not have to fight it.
 */
const PROMPT = [
  'Handheld vertical-style UGC footage reframed wide: a young creator in a',
  'dim modern apartment films herself on a phone ring light, smiling and',
  'talking to camera about a product she is holding.',
  'Shallow depth of field, warm practical lighting against a near-black',
  'background, slow natural handheld drift, one continuous shot, no cuts,',
  'no text, no captions, no logos, cinematic 35mm look, subtle film grain.',
].join(' ');

const NEGATIVE_PROMPT =
  'text, captions, subtitles, watermark, logo, split screen, cuts, jump cut, blown highlights, bright white background, distorted hands, extra fingers';

const CDN_PREFIX = 'assets/branding/website/home/hero';
const CDN_BUCKET = 'cdn.genfeed.ai';
const OUTPUT_DIR = path.resolve(import.meta.dirname, '../.hero-video');

const OUTPUTS = {
  mp4: 'hero-loop.mp4',
  posterJpg: 'hero-loop-poster.jpg',
  posterWebp: 'hero-loop-poster.webp',
  raw: 'hero-loop.raw.mp4',
  webm: 'hero-loop.webm',
} as const;

// ─── Shell ──────────────────────────────────────────────────────────────────

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr?.slice(-2000) ?? ''}`,
    );
  }

  return result.stdout ?? '';
}

function requireBinary(name: string): void {
  if (spawnSync('which', [name]).status !== 0) {
    throw new Error(`${name} is not on PATH — install it before running this.`);
  }
}

// ─── Credentials ────────────────────────────────────────────────────────────

/**
 * Read one key out of the repo-root `.env.local` without importing a dotenv
 * dependency into the website. Values are returned to the caller and never
 * logged; the caller only ever reports presence.
 */
function readEnvLocal(key: string): string | undefined {
  const envPath = path.resolve(import.meta.dirname, '../../../.env.local');

  if (process.env[key]) return process.env[key];
  if (!existsSync(envPath)) return undefined;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match?.[1] === key) {
      return match[2]?.trim().replace(/^["']|["']$/g, '');
    }
  }

  return undefined;
}

// ─── 1. Generate ────────────────────────────────────────────────────────────

async function generate(token: string, destination: string): Promise<void> {
  const { default: Replicate } = await import('replicate');
  const replicate = new Replicate({ auth: token });

  logger.log(`generating with ${MODEL} — this takes a few minutes`);

  const output = await replicate.run(MODEL, {
    input: {
      aspect_ratio: '16:9',
      duration: 10,
      fps: 24,
      negative_prompt: NEGATIVE_PROMPT,
      prompt: PROMPT,
      resolution: '1080p',
    },
  });

  const url =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? String(output[0])
        : String((output as { url?: () => URL }).url?.() ?? output);

  logger.log('downloading the generated clip');
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`download failed: ${response.status}`);
  }

  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

// ─── 2. Encode ──────────────────────────────────────────────────────────────

/**
 * Two encodes of the same source. WebM/VP9 is roughly a third smaller at the
 * same perceived quality but is not decodable on older Safari, so the MP4 is
 * the guaranteed fallback and is listed second in the `<source>` order.
 *
 * `-an` strips audio outright: the hero clip is muted by policy, and shipping a
 * silent audio track only costs bytes. `+faststart` moves the MP4 moov atom to
 * the front so the first frame decodes before the whole file has arrived.
 */
function encode(source: string, directory: string): void {
  const mp4 = path.join(directory, OUTPUTS.mp4);
  const webm = path.join(directory, OUTPUTS.webm);

  logger.log('encoding H.264 MP4');
  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-an',
    '-vf',
    'scale=1920:-2:flags=lanczos',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4,
  ]);

  logger.log('encoding VP9 WebM');
  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-an',
    '-vf',
    'scale=1920:-2:flags=lanczos',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '34',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    webm,
  ]);
}

// ─── 3. Poster ──────────────────────────────────────────────────────────────

/**
 * Frame 0 of the encoded MP4, in both WebP (small, universally supported now)
 * and JPEG (the `<video poster>` fallback). `-frames:v 1` on an unseeked input
 * is deliberate: seeking would land on the nearest keyframe, which is frame 0
 * here but would silently drift the day the encode settings change.
 */
function extractPoster(directory: string): void {
  const mp4 = path.join(directory, OUTPUTS.mp4);

  logger.log('extracting frame 0 as the poster');

  run('ffmpeg', [
    '-y',
    '-i',
    mp4,
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '82',
    path.join(directory, OUTPUTS.posterWebp),
  ]);

  run('ffmpeg', [
    '-y',
    '-i',
    mp4,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    path.join(directory, OUTPUTS.posterJpg),
  ]);
}

// ─── 4. Upload ──────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function upload(directory: string): void {
  const files = [
    OUTPUTS.mp4,
    OUTPUTS.webm,
    OUTPUTS.posterWebp,
    OUTPUTS.posterJpg,
  ];

  for (const file of files) {
    logger.log(`uploading ${file}`);
    run('aws', [
      's3',
      'cp',
      path.join(directory, file),
      `s3://${CDN_BUCKET}/${CDN_PREFIX}/${file}`,
      '--content-type',
      CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      '--cache-control',
      'public, max-age=31536000, immutable',
    ]);
  }
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const shouldUpload = args.includes('--upload');
  const fromIndex = args.indexOf('--from');
  const from = fromIndex === -1 ? undefined : args[fromIndex + 1];

  const token =
    readEnvLocal('REPLICATE_KEY') ?? readEnvLocal('REPLICATE_API_TOKEN');

  if (isDryRun) {
    logger.log(`model:        ${MODEL}`);
    logger.log(`prompt:       ${PROMPT}`);
    logger.log(`negative:     ${NEGATIVE_PROMPT}`);
    logger.log(`output dir:   ${OUTPUT_DIR}`);
    logger.log(`cdn target:   s3://${CDN_BUCKET}/${CDN_PREFIX}/`);
    logger.log(`replicate key: ${token ? 'found' : 'MISSING'}`);
    return;
  }

  requireBinary('ffmpeg');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const raw = from ? path.resolve(from) : path.join(OUTPUT_DIR, OUTPUTS.raw);

  if (!from) {
    if (!token) {
      throw new Error('REPLICATE_KEY is not set — cannot generate.');
    }
    await generate(token, raw);
  }

  encode(raw, OUTPUT_DIR);
  extractPoster(OUTPUT_DIR);

  if (shouldUpload) {
    requireBinary('aws');
    upload(OUTPUT_DIR);
    logger.log(`published to https://${CDN_BUCKET}/${CDN_PREFIX}/`);
  } else {
    logger.log(`wrote artefacts to ${OUTPUT_DIR} (pass --upload to publish)`);
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
