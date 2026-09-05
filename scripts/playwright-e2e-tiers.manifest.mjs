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
export const PLAYWRIGHT_E2E_QUARANTINES = [
  {
    file: 'playwright/e2e/tests/visual/visual-regression.spec.ts',
    reason:
      'Pixel baselines are not stable under the mocked full-tier nightly. Visual goldens need a dedicated job and update process.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/dashboard/analytics.spec.ts',
    reason:
      'Asserts retired dashboard stat widgets. Analytics lives at /analytics/overview. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/admin/business-analytics.spec.ts',
    reason:
      'Admin business-analytics cards drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/settings/profile.spec.ts',
    reason:
      'Personal-settings locators drifted (`firstName` / profile-section). Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/analytics/deep-pages.spec.ts',
    reason:
      'Insights / hooks / performance-lab / trend-turnover copy drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/workflow/execution.spec.ts',
    reason:
      'Workflow execution locators trip strict-mode. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/discovery/discovery.spec.ts',
    reason:
      'Discovery heading/copy drifted after overview canonicalization. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/calendar/scheduling.spec.ts',
    reason:
      'Publishing calendar assertions drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/auth/public-extra.spec.ts',
    reason: 'Public auth extra selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/states/error-states.spec.ts',
    reason:
      'Network-abort helper fails page.goto before the surface renders. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/studio/batch.spec.ts',
    reason:
      'Studio batch nav/count assertions drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/tasks/tasks-edge-states.spec.ts',
    reason:
      'Standalone /tasks was retired; workspace inbox owns the desk. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/tasks/tasks.spec.ts',
    reason:
      'Standalone /tasks was retired; workspace inbox owns the desk. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/chat/chat-flows.spec.ts',
    reason:
      'Agent chat analytics snapshot / publish-fallback UI drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/analytics/overview.spec.ts',
    reason:
      'Analytics overview tabs trip strict-mode (duplicate Trends links). Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/discovery/discovery-interactions.spec.ts',
    reason: 'Discovery interaction copy drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/settings/brand-interview.spec.ts',
    reason:
      'Brand interview locators trip strict-mode. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/workflow/workflow-detail.spec.ts',
    reason:
      'Workflow detail locators trip strict-mode. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/automation/overview.spec.ts',
    reason: 'Automation overview copy/nav drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/chat/plan-mode.spec.ts',
    reason: 'Plan-mode approval chrome drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/posts/posts-interactions.spec.ts',
    reason: 'Publishing desk interactions drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/posts/publishing.spec.ts',
    reason: 'Publishing flow copy drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/library/avatar-library.spec.ts',
    reason: 'Avatar library selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/admin/admin-organization.spec.ts',
    reason: 'Admin organization selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/studio/batch-clips-interactions.spec.ts',
    reason:
      'Studio batch/clips interactions drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/settings/connections.spec.ts',
    reason:
      'Connections/social settings selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/settings/organization-identity.spec.ts',
    reason:
      'Org identity-defaults selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/studio-edit/studio-edit.spec.ts',
    reason:
      'Studio edit timeline selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/brands/identity-defaults.spec.ts',
    reason:
      'Brand identity-defaults selectors drifted. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
  {
    file: 'playwright/e2e/tests/posts/management.spec.ts',
    reason:
      'Publishing list tabs/cards still assert pre-desk copy after the POM prefix fix. Evidence: run 31991510270.',
    trackingIssue: 2982,
    reviewBy: '2026-11-17',
  },
];

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
  'playwright/e2e/tests/shell/page-context-contract.spec.ts',
  'playwright/e2e/tests/studio/clips.spec.ts',
];
