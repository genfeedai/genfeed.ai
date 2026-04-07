import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [['list']],
  retries: 0,
  testDir: './e2e/tests/smoke',
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
