import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Administration section.
 *
 * Uses the adminPage fixture (admin role). Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections, so each page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Administration', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ADMIN.ADMINISTRATION.ANNOUNCEMENTS,
    APP_ROUTES.ADMIN.ADMINISTRATION.CREDIT_USAGE,
    APP_ROUTES.ADMIN.ADMINISTRATION.PLATFORM_SETTINGS,
    APP_ROUTES.ADMIN.ADMINISTRATION.ROLES,
    APP_ROUTES.ADMIN.ADMINISTRATION.SUBSCRIPTIONS,
    APP_ROUTES.ADMIN.ADMINISTRATION.SYSTEM_EMAILS,
    APP_ROUTES.ADMIN.ADMINISTRATION.WARMUP_ACCOUNTS,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('announcements view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(
      adminPage,
      APP_ROUTES.ADMIN.ADMINISTRATION.ANNOUNCEMENTS,
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('roles view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ADMINISTRATION.ROLES);
    await tryClick(adminPage, '[role="tab"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
