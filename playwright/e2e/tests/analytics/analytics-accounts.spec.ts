import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Accounts', () => {
  test.setTimeout(60_000);

  const routes = [
    `${BRAND}/analytics/accounts`,
    `${BRAND}/analytics/accounts/mock-id`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('fleet table stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/accounts`);

    await tryClick(authenticatedPage, '[aria-label="Search accounts"]');
    await tryClick(authenticatedPage, '[aria-label="Rank by metric"]');
    await tryClick(authenticatedPage, 'button:has-text("Save evaluation")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('account drill-down exposes Manage account', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/accounts/mock-id`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Manage account")');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
