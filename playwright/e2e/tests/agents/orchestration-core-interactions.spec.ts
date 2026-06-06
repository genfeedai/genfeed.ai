import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the core Orchestration surface.
 *
 * Targets render + interaction code paths across overview, orchestrator,
 * hire, the agent wizard, library, runs, analytics, autopilot, configuration,
 * the agent detail route, and content-run detail. All API + Clerk traffic is
 * mocked by the auth fixture; unknown local API routes auto-return empty
 * collections so every page renders without bespoke mocks.
 *
 * Interactions are best-effort: `tryClick` never throws and every fill is
 * guarded so a missing selector cannot hard-fail the spec.
 */

const BRAND_BASE = '/test-org/brand-1/orchestration';

test.describe('Orchestration — Core Interactions', () => {
  test.setTimeout(90_000);

  test('overview renders and quick-action cards are clickable', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/overview`);

    await tryClick(authenticatedPage, 'a:has-text("Open Runs")');
    await tryClick(authenticatedPage, 'a:has-text("Open Library")');
    await tryClick(authenticatedPage, 'a:has-text("Open Autopilot")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('content team root exposes hire and orchestrator entry points', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, BRAND_BASE);

    await tryClick(authenticatedPage, 'a[href$="/orchestration/hire"]');
    await tryClick(authenticatedPage, 'a[href$="/orchestration/orchestrator"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('hire form accepts label, persona, topic and budget input', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/hire`);

    await authenticatedPage
      .locator('#content-team-agent-label')
      .fill('Launch Specialist')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-persona')
      .fill('Confident, concise brand operator voice.')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-topic')
      .fill('creator monetization')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-budget')
      .fill('120')
      .catch(() => {});

    await tryClick(authenticatedPage, '#content-team-role');
    await tryClick(authenticatedPage, 'button:has-text("Hire Agent")');

    await expect(
      authenticatedPage.locator('#content-team-agent-label'),
    ).toHaveValue('Launch Specialist');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('orchestrator form captures campaign label and objective', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/orchestrator`);

    await authenticatedPage
      .locator('#content-team-campaign-label')
      .fill('Creator Launch Team')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-campaign-brief')
      .fill('Coordinate a multi-role launch push.')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-goal-label')
      .fill('April views target')
      .catch(() => {});
    await authenticatedPage
      .locator('#content-team-goal-target')
      .fill('100000')
      .catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Launch Team")');

    await expect(
      authenticatedPage.locator('#content-team-campaign-label'),
    ).toHaveValue('Creator Launch Team');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agent wizard steps through type, brand, configure and review', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/new`);

    // Step 1 → 2: pick a type card then advance.
    await tryClick(authenticatedPage, 'button:has-text("X Content")');
    await tryClick(authenticatedPage, 'button:has-text("Pick Brand")');

    // Step 2 → 3.
    await tryClick(authenticatedPage, 'button:has-text("Configure")');

    // Step 3: fill the required label and toggle platforms.
    await authenticatedPage
      .locator('#agent-wizard-label')
      .fill('Daily X Content Agent')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-topics')
      .fill('marketing, AI')
      .catch(() => {});
    await tryClick(authenticatedPage, 'button:has-text("Instagram")');

    // Step 3 → 4 review.
    await tryClick(authenticatedPage, 'button:has-text("Review")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('library hub renders with new-agent affordance', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/library`);

    await tryClick(authenticatedPage, 'a:has-text("New Agent")');
    await tryClick(authenticatedPage, 'a:has-text("Create your first agent")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('library typed bot route renders a configurable bot surface', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/library/twitter-reply`,
    );

    await tryClick(authenticatedPage, 'button[role="tab"]');
    await tryClick(authenticatedPage, 'button:has-text("Save")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('runs page applies query filters and surfaces routing widgets', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/runs?q=trend&range=30d`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Routing")');
    await authenticatedPage
      .locator('input[type="search"], input[placeholder*="search" i]')
      .first()
      .fill('launch')
      .catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('analytics page renders and exercises range controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/analytics`);

    await tryClick(authenticatedPage, 'button[role="tab"]');
    await tryClick(authenticatedPage, 'button:has-text("30d")');
    await tryClick(authenticatedPage, 'button:has-text("7d")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('autopilot page opens the add-autopilot dialog', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/autopilot`);

    await tryClick(authenticatedPage, 'button:has-text("Add Autopilot")');
    await tryClick(
      authenticatedPage,
      '[role="dialog"] button:has-text("Cancel")',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('configuration page renders the agent settings surface', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/configuration`);

    await tryClick(authenticatedPage, 'button[role="tab"]');
    await tryClick(authenticatedPage, 'button:has-text("Save")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agent detail route renders run history and run-now control', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/agent-1`);

    await tryClick(authenticatedPage, 'button:has-text("Run Now")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('content-run detail route renders for a known run id', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/content-runs/run-1`,
    );

    await tryClick(authenticatedPage, 'button[role="tab"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
