#!/usr/bin/env bun
/**
 * Capture the mocked website product screenshots via Playwright app-core (no
 * live backend). README screenshots come from `bun run readme:capture`.
 *
 * Starts `apps/web` with the hermetic Playwright auth bypass, intercepts
 * mock CDN media with local placeholder images, and writes frames to
 * apps/marketing/public/products/.
 *
 * Usage: bun run website:capture-products
 */
import { spawn } from 'node:child_process';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = path.resolve(import.meta.dir, '..');

const child = spawn(
  'bunx',
  [
    'playwright',
    'test',
    '--config=playwright/configs/playwright-readme-capture.config.ts',
    'playwright/e2e/readme/capture-readme-assets.spec.ts',
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CAPTURE_SET: 'website',
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
      APP_BASE_URL: process.env.APP_BASE_URL || 'http://127.0.0.1:3000',
      NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP: 'true',
      NEXT_PUBLIC_PLAYWRIGHT_TEST: 'true',
      PLAYWRIGHT_APP_COMMAND:
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
        process.env.PLAYWRIGHT_APP_COMMAND ||
        'bun run --cwd apps/web dev:debug -- --hostname ::',
      PLAYWRIGHT_TEST: 'true',
    },
    stdio: 'inherit',
  },
);

/**
 * The website set ships as WebP: Playwright only writes PNG, so convert each
 * capture beside itself and drop the PNG.
 */
async function convertWebsiteCapturesToWebp(): Promise<void> {
  const directory = path.join(repoRoot, 'apps/marketing/public/products');
  const files = await readdir(directory);

  for (const file of files.filter((name) => name.endsWith('.png'))) {
    const source = path.join(directory, file);
    await sharp(source)
      .webp({ quality: 86 })
      .toFile(source.replace(/\.png$/, '.webp'));
    await unlink(source);
  }
}

child.on('exit', async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
  if (code === 0 && process.env.CAPTURE_SET === 'website') {
    await convertWebsiteCapturesToWebp();
  }
  process.exit(code ?? 1);
});
