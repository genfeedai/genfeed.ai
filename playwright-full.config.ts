import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.APP_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const webServerUrl = process.env.PLAYWRIGHT_WEB_SERVER_URL || baseURL;
const webAppPath = process.env.PLAYWRIGHT_WEB_APP_PATH || 'apps/app';
const ciWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND_CI ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND_CI ||
  `bun run --cwd ${webAppPath} start`;
const devWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
  `bun run --cwd ${webAppPath} dev`;

export default defineConfig({
  fullyParallel: true,
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  retries: 0,
  testDir: './e2e/tests',
  testIgnore: [
    /admin\/.+\.spec\.ts/,
    /core\/.+\.spec\.ts/,
    /marketplace\/.+\.spec\.ts/,
    /website\/.+\.spec\.ts/,
  ],
  timeout: 60000,
  use: {
    actionTimeout: 15000,
    baseURL,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'off',
    viewport: { height: 720, width: 1280 },
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.CI ? ciWebServerCommand : devWebServerCommand,
        env: {
          ...process.env,
          PLAYWRIGHT_TEST: 'true',
        },
        reuseExistingServer: true,
        stderr: 'pipe',
        stdout: 'pipe',
        timeout: process.env.CI ? 30_000 : 120_000,
        url: webServerUrl,
      },
});
