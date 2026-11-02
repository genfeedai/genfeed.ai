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
  // the screen-reader-only level-one heading of AdminPageShell. The Filters
  // menu sits inside the search field and filters by organization type; sorting
  // lives in the column headers, not in the menu.
  const routes = [
    {
      hasOrganizationsList: true,
      route: APP_ROUTES.ADMIN.ORGANIZATIONS,
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
          adminPage.getByRole('menuitem', { name: /^Type/ }),
        ).toBeVisible();
        await adminPage.keyboard.press('Escape');
        await expect(organizationsListSurface(adminPage)).toBeVisible();
      }
    });
  }

  test('organization admin list href stays on the organizations page', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATIONS);

    expect(new URL(adminPage.url()).pathname).toBe(
      APP_ROUTES.ADMIN.ORGANIZATIONS,
    );
    // The organizations list itself, without the analytics tab bar.
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

  test('organizations list shows the owner email under the owner name', async ({
    adminPage,
  }) => {
    // Registered after the fixture's catch-all analytics mock, so it wins.
    await adminPage.route('**/analytics/organizations**', (route) =>
      route.fulfill({
        json: {
          data: {
            attributes: {
              data: [
                {
                  avgEngagementRate: 0,
                  growth: 0,
                  id: 'org-e2e-1',
                  name: 'Acme Inc',
                  owner: {
                    email: 'ada@example.com',
                    id: 'user-e2e-1',
                    name: 'Ada Lovelace',
                  },
                  totalBrands: 1,
                  totalEngagement: 0,
                  totalMembers: 1,
                  totalPosts: 0,
                  totalViews: 0,
                },
              ],
              pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
            },
            id: 'organizations',
            type: 'organizations',
          },
        },
      }),
    );

    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATIONS);

    const ownerLink = adminPage
      .getByRole('main')
      .getByRole('link', { name: 'Open user Ada Lovelace' });
    await expect(ownerLink).toBeVisible();
    await expect(ownerLink.getByText('ada@example.com')).toBeVisible();
  });

  test('flags releases card points to per-organization release access', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.FLAGS);

    const link = adminPage
      .getByRole('main')
      .getByRole('link', { name: 'Set release preview per organization' });
    await expect(link).toHaveAttribute('href', APP_ROUTES.ADMIN.ORGANIZATIONS);
    await link.click();

    await expect(adminPage).toHaveURL(
      new RegExp(`${APP_ROUTES.ADMIN.ORGANIZATIONS}$`),
    );
    await expect(organizationsListSurface(adminPage)).toBeVisible();
  });

  test('organization settings lists every app with one switch and keeps the tabs in the page', async ({
    adminPage,
  }) => {
    const settingsRoute = `${APP_ROUTES.ADMIN.ORGANIZATIONS}/qa-org/settings`;
    await assertRouteRenders(adminPage, settingsRoute);

    const main = adminPage.getByRole('main');

    // The Analytics / Settings tabs sit in the page, under the profile header.
    await expect(
      main
        .getByRole('navigation', { name: 'Organization' })
        .getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      main
        .getByRole('navigation', { name: 'Organization' })
        .getByRole('link', { name: 'Analytics' }),
    ).toBeVisible();

    // One list, one switch per app, with readable names, not raw keys.
    await expect(
      main.getByRole('heading', { exact: true, name: 'Apps' }),
    ).toBeVisible();
    await expect(main.getByRole('switch', { name: 'Motion' })).toBeVisible();
    await expect(main.getByRole('switch', { name: 'Campaigns' })).toBeVisible();
    await expect(main.getByRole('switch', { name: 'Brands' })).toBeVisible();
    await expect(main.getByText(/release analytics_/)).toHaveCount(0);
    await expect(main.getByText(/^show /)).toHaveCount(0);

    // One plain header per section: no eyebrow above "Apps" or "Settings".
    await expect(main.getByText('Organization Controls')).toHaveCount(0);
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
