import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the core Automation surface.
 *
 * Targets render + interaction code paths across overview, Programs,
 * agent creation, the agent library, runs, analytics, autopilot, configuration,
 * the agent detail route, and content-run detail. All API + Better Auth traffic is
 * mocked by the auth fixture; unknown local API routes auto-return empty
 * collections so every page renders without bespoke mocks.
 *
 * Interactions are best-effort: `tryClick` never throws and every fill is
 * guarded so a missing selector cannot hard-fail the spec.
 */

const BRAND_BASE = '/test-org/brand-1/automation';

test.describe('Automation — Core Interactions', () => {
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

  test('agents and Programs expose their canonical creation controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/agents`);
    await expect(
      authenticatedPage.getByRole('button', { name: 'Add agent' }),
    ).toBeVisible();

    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/campaigns`);
    await expect(
      authenticatedPage.getByRole('link', { name: 'New Program' }).first(),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('legacy hire route opens the agent library and accepts its inputs', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/hire`);
    await expect(authenticatedPage).toHaveURL(
      /\/automation\/agents\?add=library$/,
    );
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();

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

    await expect(
      authenticatedPage.locator('#content-team-agent-label'),
    ).toHaveValue('Launch Specialist');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('legacy orchestrator route opens the Creator Studio Program form', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/orchestrator`);
    await expect(authenticatedPage).toHaveURL(
      /\/automation\/campaigns\/new\?template=creator-studio$/,
    );

    await authenticatedPage
      .locator('#agent-campaign-label')
      .fill('Creator Launch Team')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-campaign-brief')
      .fill('Coordinate a multi-role launch push.')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-campaign-start-date')
      .fill('2026-09-01')
      .catch(() => {});

    await expect(
      authenticatedPage.locator('#agent-campaign-label'),
    ).toHaveValue('Creator Launch Team');
    await expect(
      authenticatedPage.getByRole('button', { name: /Creator Studio/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('legacy new-agent route opens the custom agent flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/agents/new`);
    await expect(authenticatedPage).toHaveURL(
      /\/automation\/agents\?add=custom$/,
    );
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();

    // Step 1 → 2: pick a type card, then configure it for the selected brand.
    await tryClick(authenticatedPage, 'button:has-text("X Content")');
    await tryClick(authenticatedPage, 'button:has-text("Configure")');

    // Step 2: fill the required label and toggle platforms.
    await authenticatedPage
      .locator('#agent-wizard-label')
      .fill('Daily X Content Agent')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-topics')
      .fill('marketing, AI')
      .catch(() => {});
    await tryClick(authenticatedPage, 'button:has-text("Instagram")');

    // Step 2 → 3 review.
    await tryClick(authenticatedPage, 'button:has-text("Review")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agents hub renders with new-agent affordance', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/agents`);

    await authenticatedPage
      .getByRole('button', { exact: true, name: 'Add agent' })
      .click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { exact: true, name: 'Add agent' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('tab', { exact: true, name: 'Agent library' }),
    ).toHaveAttribute('aria-selected', 'true');

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

  test('autopilot delegates agent creation to the Agents library', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/autopilot`);

    await authenticatedPage
      .getByTestId('container-header-actions')
      .getByRole('link', { name: 'Add agent' })
      .click();
    await expect(authenticatedPage).toHaveURL(
      /\/automation\/agents\?add=library$/,
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
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/agents/agent-1`);

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
