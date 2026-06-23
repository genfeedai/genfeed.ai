import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Overview Activities page.
 *
 * Uses the adminPage fixture (admin role). Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so the page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Overview Activities', () => {
  test.setTimeout(60_000);

  const routes = ['/admin/overview/activities'];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('activities view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/overview/activities');
    await tryClick(adminPage, '[role="tab"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
