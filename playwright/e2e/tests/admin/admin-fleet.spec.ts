import { APP_ROUTES } from '@genfeedai/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Fleet', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ADMIN.FLEET.GENERATE,
    APP_ROUTES.ADMIN.FLEET.LIP_SYNC,
    APP_ROUTES.ADMIN.FLEET.TRAINING,
    APP_ROUTES.ADMIN.FLEET.VOICES,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('generate surface stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.FLEET.GENERATE);
    await tryClick(adminPage, '[data-testid="fleet-generate-surface"] button');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('voices surface responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.FLEET.VOICES);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
