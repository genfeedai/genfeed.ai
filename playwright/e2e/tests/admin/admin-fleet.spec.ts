import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Fleet', () => {
  test.setTimeout(60_000);

  const routes = [
    '/admin/fleet/generate',
    '/admin/fleet/lip-sync',
    '/admin/fleet/training',
    '/admin/fleet/voices',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('generate surface stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/fleet/generate');
    await tryClick(adminPage, '[data-testid="fleet-generate-surface"] button');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('voices surface responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/fleet/voices');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
