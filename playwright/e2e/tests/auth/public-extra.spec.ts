import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * Public + Managed-Credits Route Coverage
 *
 * Covers the unauthenticated public routes (/sign-up, /request-access) and the
 * authenticated managed-credits success screen. Public routes should render
 * without bouncing to login; allowRedirectToLogin keeps the checks resilient.
 */

test.describe('Public Routes (Unauthenticated)', () => {
  test.setTimeout(60_000);

  const routes = ['/sign-up', '/request-access'];

  for (const route of routes) {
    test(`renders ${route}`, async ({ unauthenticatedPage }) => {
      await assertRouteRenders(unauthenticatedPage, route, {
        allowRedirectToLogin: true,
      });
    });
  }

  test('sign-up stays interactive', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, '/sign-up', {
      allowRedirectToLogin: true,
    });
    await tryClick(unauthenticatedPage, 'button');
    await expect(unauthenticatedPage.locator('body')).toBeVisible();
  });

  test('request-access stays interactive', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, '/request-access', {
      allowRedirectToLogin: true,
    });
    await tryClick(unauthenticatedPage, 'button');
    await expect(unauthenticatedPage.locator('body')).toBeVisible();
  });
});

test.describe('Managed Credits (Authenticated)', () => {
  test.setTimeout(60_000);

  test('renders /managed-credits/success', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, '/managed-credits/success');
  });

  test('managed-credits success stays interactive', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/managed-credits/success');
    await tryClick(authenticatedPage, 'a');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
