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
    '/onboarding/brand',
    '/onboarding/post-signup',
    '/onboarding/proactive',
    '/onboarding/providers',
    '/onboarding/success',
    '/onboarding/summary',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('brand step stays interactive after clicking', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/onboarding/brand');
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('providers step stays interactive after clicking', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/onboarding/providers');
    await tryClick(authenticatedPage, 'button');
    await tryClick(authenticatedPage, '[role="button"]');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
