import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const playwrightRoot = path.resolve(process.cwd(), 'playwright');
const artifactsRoot = path.join(playwrightRoot, 'artifacts');
const e2eRoot = path.join(playwrightRoot, 'e2e');

export default defineConfig({
  fullyParallel: true,
  globalSetup: path.join(e2eRoot, 'global-setup.ts'),
  globalTeardown: path.join(e2eRoot, 'global-teardown.ts'),
  outputDir: path.join(artifactsRoot, 'results', 'smoke'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [['list']],
  retries: 0,
  testDir: path.join(e2eRoot, 'tests', 'smoke'),
  timeout: 30000,
  use: {
    actionTimeout: 10000,
    baseURL: 'http://localhost:3000',
    navigationTimeout: 20000,
    screenshot: 'only-on-failure',
    trace: 'off',
    viewport: { height: 720, width: 1280 },
  },
  // No webServer — use the already-running dev server
});
