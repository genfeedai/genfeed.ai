#!/usr/bin/env bun
/**
 * Capture mocked README PNGs via Playwright app-core (no live backend).
 *
 * Starts `apps/app` with the hermetic Playwright auth bypass, intercepts
 * mock CDN media with local placeholder images, and writes frames to
 * docs/assets/readme/.
 *
 * Usage: bun run readme:capture
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

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
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
      APP_BASE_URL: process.env.APP_BASE_URL || 'http://127.0.0.1:3000',
      NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP: 'true',
      NEXT_PUBLIC_PLAYWRIGHT_TEST: 'true',
      PLAYWRIGHT_APP_COMMAND:
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
        process.env.PLAYWRIGHT_APP_COMMAND ||
        'bun run --cwd apps/app dev:debug -- --hostname ::',
      PLAYWRIGHT_TEST: 'true',
    },
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
