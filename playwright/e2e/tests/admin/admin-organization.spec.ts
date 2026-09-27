import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Organization and Folders pages.
 *
 * Uses the adminPage fixture (admin role). Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so each page
 * renders without per-route mocks.
 */
test.describe('Admin Organization', () => {
  test.setTimeout(60_000);

  const routes = [
    {
      heading: 'All Organizations',
      route: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS,
    },
    { heading: 'All Organizations', route: APP_ROUTES.ADMIN.ORGANIZATION },
    { heading: 'Folders', route: APP_ROUTES.ADMIN.FOLDERS },
  ];

  for (const { heading, route } of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);

      await expect(
        adminPage
          .getByRole('main')
          .getByRole('heading', { exact: true, name: heading }),
      ).toBeVisible();
    });
  }

  test('organization admin list href stays on the organizations page', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATION);

    expect(new URL(adminPage.url()).pathname).toBe(
      APP_ROUTES.ADMIN.ORGANIZATION,
    );
    // The organizations list itself, without the analytics tab bar that
    // ANALYTICS_ORGANIZATIONS wraps it in.
    await expect(
      adminPage
        .getByRole('main')
        .getByRole('heading', { exact: true, name: 'All Organizations' }),
    ).toBeVisible();
    await expect(
      adminPage
        .getByRole('main')
        .getByRole('heading', { exact: true, name: 'Analytics' }),
    ).toHaveCount(0);
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
