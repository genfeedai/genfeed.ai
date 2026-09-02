import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Media', () => {
  test.setTimeout(60_000);

  const routes = [
    `${APP_ROUTES.ADMIN.IMAGES}/mock-id`,
    `${APP_ROUTES.ADMIN.VIDEOS}/mock-id`,
    APP_ROUTES.ADMIN.LIBRARY.VOICES,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('voices library stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.LIBRARY.VOICES);
    await tryClick(
      adminPage,
      '[data-testid="voices-library-controls-surface"] button',
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('image detail responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, `${APP_ROUTES.ADMIN.IMAGES}/mock-id`);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
