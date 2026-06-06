import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const websiteBaseURL = process.env.WEBSITE_BASE_URL || 'http://localhost:3002';
const marketplaceBaseURL =
  process.env.MARKETPLACE_BASE_URL || 'http://localhost:3104';
const playwrightRoot = path.resolve(process.cwd(), 'playwright');
const artifactsRoot = path.join(playwrightRoot, 'artifacts');
const e2eRoot = path.join(playwrightRoot, 'e2e');

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  globalSetup: path.join(e2eRoot, 'global-setup.ts'),
  globalTeardown: path.join(e2eRoot, 'global-teardown.ts'),
  outputDir: path.join(artifactsRoot, 'results', 'cross-app'),
  projects: [
    {
      name: 'website',
      testMatch: /website\/.+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteBaseURL,
      },
    },
    {
      name: 'marketplace',
      testMatch: /marketplace\/.+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: marketplaceBaseURL,
      },
    },
  ],
  reporter: [
    [
      'html',
      {
        open: 'never',
        outputFolder: path.join(artifactsRoot, 'report', 'cross-app'),
      },
    ],
    [
      'json',
      {
        outputFile: path.join(
          artifactsRoot,
          'report',
          'cross-app-results.json',
        ),
      },
    ],
    isCI ? ['github'] : ['list'],
  ],
  retries: isCI ? 1 : 0,
  testDir: path.join(e2eRoot, 'tests'),
  timeout: 60000,
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { height: 720, width: 1280 },
  },
});
