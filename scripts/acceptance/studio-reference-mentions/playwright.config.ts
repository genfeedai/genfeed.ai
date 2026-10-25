import path from 'node:path';
import { defineConfig } from '@playwright/test';

const root = path.resolve(__dirname, '../../..');
export default defineConfig({
  fullyParallel: false,
  outputDir: path.join(root, 'playwright/artifacts/reference-mentions'),
  projects: [{ name: '7924-reference-mentions' }],
  reporter: [['list']],
  retries: 0,
  testDir: path.join(root, 'playwright/e2e/tests/studio'),
  testMatch: 'reference-mentions-acceptance.spec.ts',
  use: {
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct local evidence runner, no Turbo cache
    baseURL: process.env.APP_BASE_URL,
    deviceScaleFactor: 1,
    headless: true,
    launchOptions: {
      executablePath:
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    },
    locale: 'en-US',
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    trace: 'off',
  },
  workers: 1,
});
