/**
 * Playwright full-tier quarantines.
 *
 * Canonical tier names (`core`, `authed`, `full`) live in `docs/e2e-tiers.md`
 * and `PLAYWRIGHT_E2E_TIER_CONTRACT`. Core and authed stay on their existing
 * shared selectors; this file also declares full-tier exclusions.
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
export const PLAYWRIGHT_E2E_QUARANTINES = [];

/** Specs owned by other execution lanes, not broken-test quarantines. */
export const PLAYWRIGHT_E2E_LANE_EXCLUSIONS = [
  {
    lane: 'authed',
    file: 'playwright/e2e/tests/smoke/all-app-pages.authed.spec.ts',
    reason:
      'Requires a real Better Auth session. Executed by the hermetic authed job (`test:e2e:authed` / e2e-frontend-authed), not the mocked app-core full tier.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/home.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/navigation.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/pricing.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/seo.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/use-cases.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'cross-app',
    file: 'playwright/e2e/tests/website/vs-pages.spec.ts',
    reason:
      'Targets the marketing website app, not mocked Studio app-core. Covered by playwright-cross-app.config.ts.',
  },
  {
    lane: 'release-install',
    file: 'playwright/e2e/tests/release/app-loads.spec.ts',
    reason:
      'LOCAL seeded image contract (`/default/default/workspace`). Not mocked app-core.',
  },
  {
    lane: 'release-install',
    file: 'playwright/e2e/tests/release/workspace-loads.spec.ts',
    reason:
      'Requires a live LOCAL brand switcher and seeded workspace, not mocked app-core.',
  },
  {
    lane: 'release-install',
    file: 'playwright/e2e/tests/release/api-integration.spec.ts',
    reason:
      'Hits live `GET /v1/auth/bootstrap` against a seeded API, not mocked app-core.',
  },
  {
    lane: 'release-install',
    file: 'playwright/e2e/tests/release/health.spec.ts',
    reason:
      'Hits the live API health endpoint, not the mocked app-core full tier.',
  },
];

/** Single selector set for local core and CI shards. */
export const PLAYWRIGHT_E2E_CORE_PATHS = [
  'playwright/e2e/tests/smoke',
  'playwright/e2e/tests/core',
  'playwright/e2e/tests/chat/onboarding.spec.ts',
  'playwright/e2e/tests/shell/agent-dock.spec.ts',
  'playwright/e2e/tests/shell/context-sidebar.spec.ts',
  'playwright/e2e/tests/shell/page-context-contract.spec.ts',
  'playwright/e2e/tests/studio/clips.spec.ts',
  'playwright/e2e/tests/studio/generate-video-actions-drafts.spec.ts',
];
