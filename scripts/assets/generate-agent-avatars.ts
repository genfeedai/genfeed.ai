/**
 * Generate small square agent avatars with FLUX Schnell and publish them to
 * `s3://cdn.genfeed.ai/assets/agents/<preset-id>.webp`.
 *
 * Same folder shape can be reused for other catalogs:
 *   s3://cdn.genfeed.ai/assets/<surface>/<id>.webp
 *
 * Usage:
 *   bun run scripts/assets/generate-agent-avatars.ts
 *   bun run scripts/assets/generate-agent-avatars.ts --upload
 *   bun run scripts/assets/generate-agent-avatars.ts --regenerate --upload
 *
 * Reads REPLICATE_KEY or REPLICATE_API_TOKEN from the environment or
 * repo-root `.env.local`. Never prints the token.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CONTENT_TEAM_ROLE_PRESETS } from '../../packages/pages/agents/content-team/content-team-presets';

const MODEL = 'black-forest-labs/flux-schnell';
const CDN_BUCKET = 'cdn.genfeed.ai';
const CDN_PREFIX = 'assets/agents';
const OUTPUT_DIR = join(homedir(), '.codex/artifacts/product-stills/agents');
const THROTTLE_ATTEMPTS = 4;
const THROTTLE_BACKOFF_MS = 8_000;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function readEnvLocal(key: string): string | undefined {
  if (process.env[key]) {
    return process.env[key];
  }

  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    return undefined;
  }

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match?.[1] === key) {
      return match[2]?.trim().replace(/^["']|["']$/g, '');
    }
  }

  return undefined;
}

function replicateToken(): string {
  const token =
    readEnvLocal('REPLICATE_KEY') ?? readEnvLocal('REPLICATE_API_TOKEN');
  if (!token) {
    throw new Error('REPLICATE_KEY is missing. Read from root .env.local.');
  }
  return token;
}

async function withThrottleRetry<T>(
  key: string,
  submit: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await submit();
    } catch (error: unknown) {
      const message = String(error);
      const isThrottled =
        message.includes('429') || message.includes('throttled');
      if (!isThrottled || attempt >= THROTTLE_ATTEMPTS) {
        throw error;
      }
      const wait = THROTTLE_BACKOFF_MS * attempt;
      log(`${key}: throttled, retrying in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

function outputUrl(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    return String(output[0]);
  }
  if (output && typeof output === 'object' && 'url' in output) {
    const url = (output as { url?: unknown }).url;
    if (typeof url === 'function') {
      return String(url());
    }
    if (typeof url === 'string') {
      return url;
    }
  }
  throw new Error(`unexpected replicate output: ${typeof output}`);
}

function avatarPrompt(role: string, description: string): string {
  return [
    'Square 1:1 product avatar for a content-creation app.',
    'Close-crop head-and-shoulders character portrait, dark charcoal studio, soft cinematic rim light.',
    'Stylized illustrated photograph, not photoreal 1080p beauty lighting.',
    'Absolutely no text, letters, captions, titles, watermarks, logos, or UI.',
    `Subject: ${role}. ${description}`,
  ].join(' ');
}

async function cropFace(id: string, source: string): Promise<string> {
  const sharp = (await import('sharp')).default;
  const destination = join(OUTPUT_DIR, `${id}.face.webp`);
  const image = sharp(source);
  const meta = await image.metadata();
  const width = meta.width ?? 512;
  const height = meta.height ?? 512;
  const size = Math.min(width, Math.floor(height * 0.78));
  const left = Math.max(0, Math.floor((width - size) / 2));
  await image
    .extract({ height: size, left, top: 0, width: size })
    .resize(256, 256)
    .webp({ quality: 80 })
    .toFile(destination);
  log(`${id}: cropped face still`);
  return destination;
}

async function generateAvatar(
  token: string,
  id: string,
  role: string,
  description: string,
  shouldRegenerate: boolean,
): Promise<string> {
  const destination = join(OUTPUT_DIR, `${id}.webp`);
  if (existsSync(destination) && !shouldRegenerate) {
    log(`${id}: reusing cached still`);
    return destination;
  }

  const { default: Replicate } = await import('replicate');
  const replicate = new Replicate({ auth: token });
  log(`${id}: generating with ${MODEL}`);

  const output = await withThrottleRetry(id, () =>
    replicate.run(MODEL, {
      input: {
        aspect_ratio: '1:1',
        go_fast: true,
        megapixels: '0.25',
        num_outputs: 1,
        output_format: 'webp',
        output_quality: 80,
        prompt: avatarPrompt(role, description),
      },
    }),
  );

  const response = await fetch(outputUrl(output));
  if (!response.ok) {
    throw new Error(`${id}: download failed (${response.status})`);
  }

  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  log(`${id}: wrote ${destination}`);
  return destination;
}

function awsEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, AWS_PROFILE: 'genfeedai' };
  delete env.AWS_ACCESS_KEY_ID;
  delete env.AWS_SECRET_ACCESS_KEY;
  delete env.AWS_SESSION_TOKEN;
  return env;
}

function uploadAvatar(id: string, file: string): void {
  const key = `${CDN_PREFIX}/${id}.webp`;
  log(`uploading ${key}`);
  const result = spawnSync(
    'aws',
    [
      's3',
      'cp',
      file,
      `s3://${CDN_BUCKET}/${key}`,
      '--content-type',
      'image/webp',
      '--cache-control',
      'public, max-age=31536000, immutable',
    ],
    { encoding: 'utf8', env: awsEnv() },
  );
  if (result.status !== 0) {
    throw new Error(`${id}: s3 upload failed: ${result.stderr?.slice(-1000)}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldRegenerate = args.includes('--regenerate');
  const shouldUpload = args.includes('--upload');
  const token = replicateToken();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  log(`model: ${MODEL}`);
  log(`stills: ${CONTENT_TEAM_ROLE_PRESETS.length}`);
  log(`cdn: s3://${CDN_BUCKET}/${CDN_PREFIX}/`);
  log(`replicate key: found`);

  for (const preset of CONTENT_TEAM_ROLE_PRESETS) {
    const file = await generateAvatar(
      token,
      preset.id,
      preset.displayRole,
      preset.description,
      shouldRegenerate,
    );
    const avatar = await cropFace(preset.id, file);
    if (shouldUpload) {
      uploadAvatar(preset.id, avatar);
    }
  }
}

await main();
