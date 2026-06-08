import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Administration section.
 *
 * Uses the adminPage fixture (admin role). Auth, Clerk, and all API calls are
 * mocked; unknown local API routes auto-return empty collections, so each page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Administration', () => {
  test.setTimeout(60_000);

  const routes = [
    '/admin/administration/announcements',
    '/admin/administration/roles',
    '/admin/administration/subscriptions',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('announcements view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/administration/announcements');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('roles view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/administration/roles');
    await tryClick(adminPage, '[role="tab"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
