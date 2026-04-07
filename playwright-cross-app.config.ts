import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const websiteBaseURL = process.env.WEBSITE_BASE_URL || 'http://localhost:3002';
const marketplaceBaseURL =
  process.env.MARKETPLACE_BASE_URL || 'http://localhost:3104';

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'playwright-results/cross-app',
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
    ['html', { open: 'never', outputFolder: 'playwright-report/cross-app' }],
    ['json', { outputFile: 'playwright-report/cross-app-results.json' }],
    isCI ? ['github'] : ['list'],
  ],
  retries: isCI ? 1 : 0,
  testDir: './e2e/tests',
  timeout: 60000,
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { height: 720, width: 1280 },
  },
});
