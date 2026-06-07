import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route-render coverage for the Admin Configuration section.
 *
 * Uses the adminPage fixture (admin routes are not tenant-scoped). All API and
 * Clerk calls are mocked; unknown API routes auto-return empty collections so
 * each page renders without bespoke mocks.
 */
test.describe('Admin Configuration', () => {
  test.setTimeout(90_000);

  const routes = [
    '/admin/configuration/elements/blacklists',
    '/admin/configuration/elements/camera-movements',
    '/admin/configuration/elements/cameras',
    '/admin/configuration/elements/lenses',
    '/admin/configuration/elements/lightings',
    '/admin/configuration/elements/moods',
    '/admin/configuration/elements/scenes',
    '/admin/configuration/elements/sounds',
    '/admin/configuration/elements/styles',
    '/admin/configuration/font-families',
    '/admin/configuration/presets',
    '/admin/configuration/tags',
    '/admin/configuration/tags/all',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('presets list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/configuration/presets');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('element list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(
      adminPage,
      '/admin/configuration/elements/cameras',
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
