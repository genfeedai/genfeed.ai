import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
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

  // The breadcrumb is the page title, so each admin page renders its title as
  // the screen-reader-only level-one heading of AdminPageShell. The sort lives
  // in the subbar, not in a heading inside the content.
  const routes = [
    {
      hasOrganizationsList: true,
      route: APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS,
      title: 'Analytics',
    },
    {
      hasOrganizationsList: true,
      route: APP_ROUTES.ADMIN.ORGANIZATION,
      title: 'Organizations',
    },
    {
      hasOrganizationsList: false,
      route: APP_ROUTES.ADMIN.FOLDERS,
      title: 'Folders',
    },
  ];

  /** The organizations table, or its empty state when the API returns none. */
  function organizationsListSurface(adminPage: Page): Locator {
    return adminPage
      .getByRole('main')
      .getByRole('columnheader', { exact: true, name: 'Organization' })
      .or(adminPage.getByRole('main').getByText('No organizations found'));
  }

  for (const { hasOrganizationsList, route, title } of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);

      await expect(
        adminPage
          .getByRole('main')
          .getByRole('heading', { exact: true, level: 1, name: title }),
      ).toBeVisible();

      if (hasOrganizationsList) {
        await adminPage.getByRole('button', { name: /^Filters/ }).click();
        await expect(
          adminPage.getByRole('menuitem', { name: /^Sort/ }),
        ).toBeVisible();
        await adminPage.keyboard.press('Escape');
        await expect(organizationsListSurface(adminPage)).toBeVisible();
      }
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
        .getByRole('heading', { exact: true, level: 1, name: 'Organizations' }),
    ).toBeVisible();
    await expect(organizationsListSurface(adminPage)).toBeVisible();
    await expect(
      adminPage
        .getByRole('main')
        .getByRole('heading', { exact: true, name: 'Analytics' }),
    ).toHaveCount(0);
    await expect(
      adminPage.getByRole('main').getByRole('tab', { name: 'Brands' }),
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
