import path from 'node:path';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Playwright Configuration for E2E CODE COVERAGE runs.
 *
 * Reuses the canonical `playwright.config.ts` (same webServer, auth bypass and
 * API mocking) and layers in monocart-reporter's V8 coverage collection.
 *
 * Usage:
 *   bun run test:e2e:coverage           # full suite + coverage report
 *   E2E_COVERAGE=1 bunx playwright test --config=playwright-coverage.config.ts
 *
 * Output:
 *   playwright-report/coverage/index.html   # interactive V8 report
 *   playwright-report/coverage/lcov.info    # lcov for CI / codecov
 *   console summary with line/statement %
 *
 * Coverage is gathered per-test by `e2e/fixtures/coverage.fixture.ts` (Chromium
 * only) and only when E2E_COVERAGE=1, which the `test:e2e:coverage` script sets.
 *
 * Source maps: in local `dev` mode Next emits them by default. For a production
 * (`next start`) run set E2E_COVERAGE=1 so apps/app enables
 * productionBrowserSourceMaps (see apps/app/next.config.ts).
 */

const COVERAGE_THRESHOLD = Number(process.env.E2E_COVERAGE_THRESHOLD ?? '80');

export default defineConfig({
  ...baseConfig,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/html' }],
    [
      'monocart-reporter',
      {
        coverage: {
          // Only consider first-party app + shared package source.
          sourceFilter: (sourcePath: string): boolean =>
            /(?:apps\/app\/|packages\/)(?!.*node_modules)/.test(sourcePath) &&
            !sourcePath.includes('.next/'),
          // Drop framework/runtime bundles we don't author.
          entryFilter: (entry: { url: string }): boolean =>
            (entry.url.includes('127.0.0.1') ||
              entry.url.includes('localhost')) &&
            !entry.url.includes('/__nextjs') &&
            !entry.url.includes('react-refresh'),
          name: 'Genfeed App E2E Code Coverage',
          outputDir: path.join('playwright-report', 'coverage'),
          reports: [
            ['v8'],
            ['console-summary'],
            ['lcovonly', { file: 'lcov.info' }],
          ],
          // Fail the run if coverage drops below target.
          thresholds: {
            bytes: COVERAGE_THRESHOLD,
            lines: COVERAGE_THRESHOLD,
            statements: COVERAGE_THRESHOLD,
          },
        },
        name: 'Genfeed E2E',
        outputFile: path.join('playwright-report', 'coverage', 'index.html'),
      },
    ],
  ],
});
