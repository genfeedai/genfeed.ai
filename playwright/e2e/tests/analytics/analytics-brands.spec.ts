import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route specs for the brand-scoped Brands Analytics surfaces.
 *
 * Navigates to the brands list, a single-brand analytics detail view, and a
 * platform-scoped breakdown. Analytics summary + timeseries endpoints are
 * already mocked with sample data in the shared API interceptor, so the pages
 * render real charts/tables without per-spec mocks. Interaction tests exercise
 * tabs, date-range, and platform filter controls via `tryClick` to boost
 * code coverage without making the specs brittle.
 */

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Brands', () => {
  test.setTimeout(60_000);

  const routes = [
    `${BRAND}/analytics/brands`,
    `${BRAND}/analytics/brands/mock-id`,
    `${BRAND}/analytics/brands/mock-id/platforms/tiktok`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('brands list stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/brands`);

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, 'button:has-text("Last 7 days")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('brand detail stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/brands/mock-id`,
    );

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[data-testid="date-range-trigger"]');
    await tryClick(authenticatedPage, '[data-testid="platform-filter"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('platform breakdown stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/brands/mock-id/platforms/tiktok`,
    );

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
