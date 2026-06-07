import { test as base } from '@playwright/test';

/**
 * Code-Coverage Fixture for Playwright E2E Tests
 *
 * Collects V8 JavaScript coverage from the browser for every test and feeds it
 * to monocart-reporter, which maps the executed bytes back to TypeScript source
 * via source maps and produces an HTML + lcov report.
 *
 * HOW IT WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 * - Opt-in: only active when `E2E_COVERAGE=1` is set (see `test:e2e:coverage`).
 *   Normal `test:e2e` runs are completely unaffected — no perf cost, no dep.
 * - Chromium-only: V8 coverage (`page.coverage`) is a Chromium/CDP feature.
 *   On any other browser the fixture is a no-op pass-through.
 * - `resetOnNavigation: false` so coverage accumulates across the navigations
 *   the auth fixtures perform (they `goto` a bootstrap path during setup).
 * - monocart-reporter is imported dynamically so the package is never required
 *   for a normal (non-coverage) run.
 *
 * This `test` is the base that `auth.fixture.ts` extends, so EVERY spec that
 * imports `test` from the fixtures is automatically instrumented under
 * `E2E_COVERAGE=1` with zero per-spec changes.
 *
 * @module coverage.fixture
 */

const COVERAGE_ENABLED = process.env.E2E_COVERAGE === '1';

interface CoverageFixtures {
  /**
   * Auto fixture — runs for every test without being referenced. Wraps the test
   * body in V8 coverage start/stop when coverage collection is enabled.
   * `void` is the idiomatic Playwright type for a fixture that provides no value.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: Playwright auto-fixture provides no value
  _coverageCollector: void;
}

export const test = base.extend<CoverageFixtures>({
  _coverageCollector: [
    async ({ browserName, page }, use): Promise<void> => {
      const canCollect = COVERAGE_ENABLED && browserName === 'chromium';

      if (!canCollect) {
        await use();
        return;
      }

      await page.coverage.startJSCoverage({ resetOnNavigation: false });

      await use();

      const coverage = await page.coverage.stopJSCoverage();

      // Dynamic import keeps monocart-reporter out of the default run path.
      const { addCoverageReport } = await import('monocart-reporter');
      await addCoverageReport(coverage, test.info());
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
