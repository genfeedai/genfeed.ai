import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Organization and Folders pages.
 *
 * Uses the adminPage fixture (admin role). Auth, Clerk, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so each page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Organization', () => {
  test.setTimeout(60_000);

  const routes = ['/admin/organization', '/admin/folders'];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('organization settings surface stays interactive', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, '/admin/organization');
    await expect(
      adminPage.locator('[data-testid="organization-settings-surface"]'),
    ).toBeVisible();
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('folders view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/folders');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
