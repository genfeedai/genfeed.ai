import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * Onboarding Steps Route Coverage
 *
 * Direct-render checks for each onboarding wizard step plus the post-signup
 * and success screens. Onboarding routes are NOT tenant-scoped, so the
 * super-admin authenticatedPage session renders them without redirect.
 */

test.describe('Onboarding Steps', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ONBOARDING.BRAND,
    APP_ROUTES.ONBOARDING.POST_SIGNUP,
    APP_ROUTES.ONBOARDING.PROACTIVE,
    APP_ROUTES.ONBOARDING.PROVIDERS,
    APP_ROUTES.ONBOARDING.SUCCESS,
    APP_ROUTES.ONBOARDING.SUMMARY,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      const response = await authenticatedPage.goto(route, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status() ?? 0).toBeLessThan(400);
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await expect(authenticatedPage.locator('body')).toBeVisible();
    });
  }

  test('brand step stays interactive after clicking', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, APP_ROUTES.ONBOARDING.BRAND);
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('providers step stays interactive after clicking', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      APP_ROUTES.ONBOARDING.PROVIDERS,
    );
    await tryClick(authenticatedPage, 'button');
    await tryClick(authenticatedPage, '[role="button"]');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
