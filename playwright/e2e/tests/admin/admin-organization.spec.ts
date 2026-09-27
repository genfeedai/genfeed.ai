import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Organization and Folders pages.
 *
 * Uses the adminPage fixture (admin role). Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so each page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Organization', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS,
    APP_ROUTES.ADMIN.ORGANIZATION,
    APP_ROUTES.ADMIN.FOLDERS,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('organization admin list href stays on the organizations page', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATION);
    expect(adminPage.url()).toContain(APP_ROUTES.ADMIN.ORGANIZATION);
    expect(adminPage.url()).not.toContain(
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS,
    );
  });

  test('folders view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.FOLDERS);

    // tryClick + "body is visible" never asserts anything real (any
    // non-blank page satisfies it). Refresh (folders-list.tsx) is the one
    // control every scope renders — the "New Folder" create button is
    // hidden for PageScope.SUPERADMIN, which is what this route always
    // passes. Assert the click actually re-fetches, not just that some
    // button existed to click.
    const refreshButton = adminPage.getByRole('button', { name: 'Refresh' });
    await expect(refreshButton).toBeVisible();

    const refreshRequest = adminPage.waitForResponse(
      (response) =>
        response.url().includes('/folders') &&
        response.request().method() === 'GET',
    );
    await refreshButton.click();
    await refreshRequest;
  });
});
