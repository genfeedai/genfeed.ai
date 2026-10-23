import path from 'node:path';
import { defineConfig } from '@playwright/test';

const root = path.resolve(__dirname, '../../..');
export default defineConfig({
  fullyParallel: false,
  outputDir: path.join(root, 'playwright/artifacts/workspace-split'),
  projects: [{ name: '7900-workspace-acceptance' }],
  reporter: [['list']],
  retries: 0,
  testDir: path.join(root, 'playwright/e2e/tests/studio'),
  testMatch: 'workspace-split-acceptance.spec.ts',
  use: {
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct runner, no Turbo caching
    baseURL: process.env.APP_BASE_URL,
    deviceScaleFactor: 1,
    headless: true,
    launchOptions: {
      executablePath:
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    },
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    locale: 'en-US',
    trace: 'off',
  },
  workers: 1,
});
