import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Self-Hosted Release E2E config — drives the LIVE released container.
 *
 * Unlike every other config here, this one talks to a REAL backend: the
 * `e2e-selfhosted-release.yml` workflow boots the published self-hosted image
 * (`ghcr.io/genfeedai/genfeed.ai:<tag>`) + Postgres via docker compose in LOCAL
 * mode, then points these specs at it. So, deliberately:
 *   - NO `webServer` — compose owns the stack; Playwright must not spawn its own.
 *   - NO `globalSetup`/`globalTeardown` — the shared ones force
 *     `PLAYWRIGHT_TEST=true` (mock/bypass mode) and prune a Turbopack dev cache
 *     that does not exist against a container. Neither applies here.
 *   - NO mock fixtures, NO network guard — the whole point is the real API.
 *
 * Base URLs come from the workflow (APP_BASE_URL / API_BASE_URL), defaulting to
 * the compose-published localhost ports for local runs.
 */

const isCI = !!process.env.CI;
const appBaseURL = process.env.APP_BASE_URL || 'http://localhost:3000';
const playwrightRoot = path.resolve(process.cwd(), 'playwright');
const artifactsRoot = path.join(playwrightRoot, 'artifacts');
const e2eRoot = path.join(playwrightRoot, 'e2e');

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: false,
  outputDir: path.join(artifactsRoot, 'results', 'release'),
  projects: [
    {
      name: 'release',
      use: { ...devices['Desktop Chrome'], baseURL: appBaseURL },
    },
  ],
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.join(artifactsRoot, 'report'),
      },
    ],
    ...(isCI ? [['github'] as const] : []),
  ],
  retries: 1,
  testDir: path.join(e2eRoot, 'tests', 'release'),
  timeout: 60000,
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { height: 720, width: 1280 },
  },
  workers: 1,
});
