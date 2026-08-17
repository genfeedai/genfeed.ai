/**
 * Playwright full-tier quarantines.
 *
 * Canonical tier names (`core`, `authed`, `full`) live in `docs/e2e-tiers.md`
 * and `PLAYWRIGHT_E2E_TIER_CONTRACT`. Core and authed stay on their existing
 * scripts; this file only excludes specs from the discovery-based full tier.
 *
 * Every quarantine must have a reason, an owner or tracking issue, and a
 * review date (`YYYY-MM-DD`). Expired rows fail CI so they cannot rot.
 */

/**
 * @typedef {{
 *   file: string,
 *   reason: string,
 *   owner?: string,
 *   trackingIssue?: number,
 *   reviewBy: string,
 * }} PlaywrightE2eQuarantine
 */

/** @type {PlaywrightE2eQuarantine[]} */
export const PLAYWRIGHT_E2E_QUARANTINES = [
  {
    file: 'playwright/e2e/tests/smoke/all-app-pages.authed.spec.ts',
    reason:
      'Requires a real Better Auth session. Executed by the hermetic authed job (`test:e2e:authed` / e2e-frontend-authed), not the mocked app-core full tier.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/home.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/navigation.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/pricing.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/seo.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/use-cases.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/website/vs-pages.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
    trackingIssue: 71,
    reviewBy: '2026-11-14',
  },
  {
    file: 'playwright/e2e/tests/visual/visual-regression.spec.ts',
    reason:
      'Pixel baselines are not stable under the mocked full-tier nightly. Visual goldens need a dedicated job and update process.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/release/app-loads.spec.ts',
    reason:
      'LOCAL seeded image contract (`/default/default/workspace`). Not mocked app-core.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/release/workspace-loads.spec.ts',
    reason:
      'Requires a live LOCAL brand switcher and seeded workspace, not mocked app-core.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/release/api-integration.spec.ts',
    reason:
      'Hits live `GET /v1/auth/bootstrap` against a seeded API, not mocked app-core.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/release/health.spec.ts',
    reason:
      'Hits the live API health endpoint, not the mocked app-core full tier.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
];
