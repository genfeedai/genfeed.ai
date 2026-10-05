import path from 'node:path';
import { defineConfig } from '@playwright/test';

// The CI step runs from the repo root; resolve the app against it so the web
// server never depends on Playwright's config-relative default cwd.
const webAppPath = path.resolve(process.cwd(), 'apps/app');

export default defineConfig({
  testDir: path.resolve(__dirname, '../e2e/tests/desktop'),
  testMatch: 'desktop-runtime-electron.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: path.resolve(__dirname, '../artifacts/electron-runtime'),
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:57161' },
  globalSetup: path.resolve(__dirname, '../e2e/global-setup.ts'),
  webServer: {
    command: `bun run --cwd ${webAppPath} start -- --hostname 127.0.0.1 --port 57161`,
    url: 'http://127.0.0.1:57161/playwright-ready',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_PLAYWRIGHT_TEST: 'true',
      NEXT_PUBLIC_GENFEED_CLOUD: 'false',
      NEXT_PUBLIC_API_ENDPOINT: 'https://api.genfeed.ai/v1',
      BETTER_AUTH_SECRET: 'test-better-auth-secret',
    },
  },
});
