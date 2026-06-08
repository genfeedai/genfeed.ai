import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Media', () => {
  test.setTimeout(60_000);

  const routes = [
    '/admin/images/mock-id',
    '/admin/videos/mock-id',
    '/admin/library/voices',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('voices library stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/library/voices');
    await tryClick(
      adminPage,
      '[data-testid="voices-library-controls-surface"] button',
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('image detail responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/images/mock-id');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
