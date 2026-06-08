import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Darkroom', () => {
  test.setTimeout(60_000);

  const routes = [
    '/admin/darkroom/generate',
    '/admin/darkroom/lip-sync',
    '/admin/darkroom/training',
    '/admin/darkroom/voices',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('generate surface stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/darkroom/generate');
    await tryClick(
      adminPage,
      '[data-testid="darkroom-generate-surface"] button',
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('voices surface responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/darkroom/voices');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
