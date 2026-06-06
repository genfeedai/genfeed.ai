import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * OAuth Route Coverage
 *
 * Direct-render checks for the OAuth entry points: the CLI device-link flow
 * (/oauth/cli) and the per-platform OAuth handler (/oauth/[platform], here
 * exercised via /oauth/tiktok). Both require an authenticated session.
 */

test.describe('OAuth Routes', () => {
  test.setTimeout(60_000);

  const routes = ['/oauth/cli', '/oauth/tiktok'];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('oauth cli stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, '/oauth/cli');
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('oauth platform stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, '/oauth/tiktok');
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
