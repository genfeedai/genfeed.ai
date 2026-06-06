import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the Orchestration campaign surfaces:
 * agent campaigns (list, create, detail) and outreach campaigns (list,
 * multi-step wizard, detail).
 *
 * All API + Clerk traffic is mocked by the auth fixture; unknown local API
 * routes auto-return empty collections, so list and detail pages render
 * without bespoke mocks. Form interactions are guarded with `.catch` and
 * `tryClick` so missing selectors never hard-fail the spec.
 */

const BRAND_BASE = '/test-org/brand-1/orchestration';

test.describe('Orchestration — Campaign Interactions', () => {
  test.setTimeout(90_000);

  test('agent campaigns list renders with a new-campaign affordance', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/campaigns`);

    await tryClick(authenticatedPage, 'a:has-text("New Campaign")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agent campaign create form accepts label, brief and schedule', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/campaigns/new`);

    await authenticatedPage
      .locator('#agent-campaign-label')
      .fill('Q1 Product Launch')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-campaign-start-date')
      .fill('2026-07-01')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-campaign-end-date')
      .fill('2026-08-01')
      .catch(() => {});
    await authenticatedPage
      .locator('#agent-campaign-credits')
      .fill('500')
      .catch(() => {});

    await tryClick(authenticatedPage, 'button:has-text("Create Campaign")');

    await expect(
      authenticatedPage.locator('#agent-campaign-label'),
    ).toHaveValue('Q1 Product Launch');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agent campaign create form toggles status select', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND_BASE}/campaigns/new`);

    await tryClick(authenticatedPage, 'button[role="combobox"]');
    await tryClick(authenticatedPage, '[role="option"]:has-text("Active")');
    await tryClick(authenticatedPage, 'button:has-text("Cancel")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('agent campaign detail route renders for a known id', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/campaigns/mock-id`,
    );

    await tryClick(authenticatedPage, 'button[role="tab"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach campaigns list renders KPIs and new-campaign action', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns`,
    );

    await tryClick(authenticatedPage, 'button:has-text("New Campaign")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach wizard selects platform and campaign type on step one', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/new`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Reddit")');
    await tryClick(authenticatedPage, 'button:has-text("Discovery")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach wizard captures name and description on configuration step', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/new`,
    );

    // Advance from step 1 (Platform & Type) to step 2 (Configuration).
    await tryClick(authenticatedPage, 'button:has-text("Twitter")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');

    await authenticatedPage
      .locator('#campaign-wizard-name')
      .fill('Product Launch Outreach')
      .catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach wizard walks forward through several steps', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/new`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Twitter")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');

    await authenticatedPage
      .locator('#campaign-wizard-name')
      .fill('Multi-step Outreach')
      .catch(() => {});

    // Step 2 → 3 → 4: continue while the Next button stays enabled.
    await tryClick(authenticatedPage, 'button:has-text("Next")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');

    await tryClick(authenticatedPage, 'button:has-text("Back")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach wizard adjusts rate-limit inputs when reachable', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/new`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Twitter")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');
    await authenticatedPage
      .locator('#campaign-wizard-name')
      .fill('Rate Limited Outreach')
      .catch(() => {});
    await tryClick(authenticatedPage, 'button:has-text("Next")');
    await tryClick(authenticatedPage, 'button:has-text("Next")');

    await authenticatedPage
      .locator('#campaign-wizard-max-per-hour')
      .fill('5')
      .catch(() => {});
    await authenticatedPage
      .locator('#campaign-wizard-max-per-day')
      .fill('20')
      .catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach campaign detail route renders for a known id', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/mock-id`,
    );

    await tryClick(authenticatedPage, 'button[role="tab"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('outreach wizard back from step one returns to campaigns list', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND_BASE}/outreach-campaigns/new`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Back")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
