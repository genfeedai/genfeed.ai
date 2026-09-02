import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route-render coverage for the Admin Automation section.
 *
 * Uses the adminPage fixture (admin routes are not tenant-scoped). All API and
 * Better Auth calls are mocked; unknown API routes auto-return empty collections so
 * each page renders without bespoke mocks.
 */
test.describe('Admin Automation', () => {
  test.setTimeout(90_000);

  const routes = [
    APP_ROUTES.ADMIN.AUTOMATION.BOTS,
    `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/image`,
    APP_ROUTES.ADMIN.AUTOMATION.TRAININGS,
    `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/mock-id/images`,
    `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/mock-id/sources`,
    APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('bots list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AUTOMATION.BOTS);
    await tryClick(adminPage, '[data-testid="automation-bots-surface"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('workflows list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
