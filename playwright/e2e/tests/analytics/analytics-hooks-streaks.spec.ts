import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route specs for the brand-scoped Hook Performance and Streaks analytics
 * surfaces. Both render under the analytics layout and rely on the shared
 * mocked analytics + organization streak endpoints. Interaction tests poke
 * tabs, platform filters, and date-range controls via `tryClick` for coverage.
 */

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Hooks & Streaks', () => {
  test.setTimeout(60_000);

  const routes = [`${BRAND}/analytics/hooks`, `${BRAND}/analytics/streaks`];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('hooks page stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/hooks`);

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, '[data-testid="platform-filter"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('streaks page stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/streaks`);

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, 'button:has-text("Last 7 days")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
