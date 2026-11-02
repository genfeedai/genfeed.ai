import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
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
                  ownerEmailClass: 'company',
                  totalBrands: 1,
                  totalEngagement: 0,
                  totalGenerations: 0,
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

  test('organizations list highlights work emails, shows logos and usage, and filters by owner email', async ({
    adminPage,
  }) => {
    const requestedEmailClasses: Array<string | null> = [];
    const organization = (
      overrides: Record<string, unknown>,
    ): Record<string, unknown> => ({
      avgEngagementRate: 0,
      growth: 0,
      ownerEmailClass: 'unknown',
      totalBrands: 1,
      totalEngagement: 0,
      totalGenerations: 0,
      totalMembers: 1,
      totalPosts: 0,
      totalViews: 0,
      ...overrides,
    });
    // Registered after the fixture's catch-all analytics mock, so it wins.
    await adminPage.route('**/analytics/organizations**', (route) => {
      const emailClass = new URL(route.request().url()).searchParams.get(
        'emailClass',
      );
      requestedEmailClasses.push(emailClass);
      const organizations = [
        organization({
          id: 'org-e2e-work',
          logo: 'https://cdn.example.test/gateway.png',
          name: 'Gateway Ventures',
          owner: {
            email: 'poya@vitae.ai',
            id: 'user-e2e-work',
            name: 'Poya',
          },
          ownerEmailClass: 'company',
          totalGenerations: 12,
          type: 'BUSINESS',
        }),
        organization({
          id: 'org-e2e-personal',
          name: 'Personal',
          owner: {
            email: 'someone@gmail.com',
            id: 'user-e2e-personal',
            name: 'Someone',
          },
          ownerEmailClass: 'personal',
        }),
      ];
      const visible =
        emailClass === 'company' ? organizations.slice(0, 1) : organizations;
      return route.fulfill({
        json: {
          data: {
            attributes: {
              data: visible,
              pagination: {
                limit: 10,
                page: 1,
                total: visible.length,
                totalPages: 1,
              },
            },
            id: 'organizations',
            type: 'organizations',
          },
        },
      });
    });

    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATIONS);

    const main = adminPage.getByRole('main');
    const workRow = main.getByRole('row', { name: /Gateway Ventures/ });
    const personalRow = main.getByRole('row', { name: /Personal/ });
    await expect(workRow.getByText('Work email')).toBeVisible();
    await expect(workRow.getByText('Business', { exact: true })).toBeVisible();
    await expect(workRow.getByText('12')).toBeVisible();
    await expect(personalRow.getByText('Personal email')).toBeVisible();
    await expect(personalRow.getByText('Not set')).toBeVisible();
    await adminPage
      .getByRole('button', { exact: true, name: 'Filters' })
      .click();
    await adminPage.getByRole('menuitem', { name: /^Owner email/ }).click();
    const filtered = adminPage.waitForRequest((request) =>
      request.url().includes('emailClass=company'),
    );
    await adminPage.getByRole('menuitemradio', { name: 'Work email' }).click();
    await filtered;

    expect(requestedEmailClasses).toContain('company');
    await adminPage.keyboard.press('Escape');
    await expect(
      main.getByRole('row', { name: /Gateway Ventures/ }),
    ).toBeVisible();
    await expect(main.getByRole('row', { name: /Personal/ })).toHaveCount(0);
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

  /** The unit economics report: one organization row, or its one user. */
  async function mockUnitEconomics(adminPage: Page): Promise<string[]> {
    const requestedOrganizations: string[] = [];
    const metrics = {
      agentChatCredits: 12,
      agentTurns: 40,
      generationCredits: 3,
      grossMarginPercent: 80,
      grossMarginUsd: 80,
      llmProviderCostUsd: 15,
      mediaProviderCostUsd: 5,
      revenueUsd: 100,
    };
    await adminPage.route(
      createPlaywrightMockApiRoutePattern('admin/unit-economics(?:\\?.*)?$'),
      (route) => {
        const organizationId = new URL(route.request().url()).searchParams.get(
          'organizationId',
        );
        if (organizationId) {
          requestedOrganizations.push(organizationId);
        }
        return route.fulfill({
          json: {
            data: {
              attributes: {
                from: '2026-10-01T00:00:00.000Z',
                organizationId,
                organizationLabel: organizationId ? 'Acme Inc' : null,
                pagination: { limit: 15, page: 1, pages: 1, total: 1 },
                rows: [
                  {
                    ...metrics,
                    id: organizationId ? 'user-spend-1' : 'org-spend-1',
                    label: organizationId ? 'ada@example.com' : 'Acme Inc',
                    topModels: [],
                  },
                ],
                to: '2026-10-30T23:59:59.999Z',
                totals: metrics,
              },
              id: 'mock-unit-economics',
              type: 'unit-economics-report',
            },
          },
        });
      },
    );
    return requestedOrganizations;
  }

  test('organization Spending tab shows revenue, cost and margin per user', async ({
    adminPage,
  }) => {
    const requestedOrganizations = await mockUnitEconomics(adminPage);

    await assertRouteRenders(
      adminPage,
      `${APP_ROUTES.ADMIN.ORGANIZATIONS}/org-spend-1/spending`,
    );

    await expect(
      adminPage
        .getByRole('main')
        .getByRole('cell', { name: 'ada@example.com' }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('main').getByText('LLM $15.00 · generation $5.00'),
    ).toBeVisible();
    expect(requestedOrganizations).toContain('org-spend-1');
  });

  test('economics organizations row opens its details in the context sidebar', async ({
    adminPage,
  }) => {
    await mockUnitEconomics(adminPage);

    await assertRouteRenders(
      adminPage,
      APP_ROUTES.ADMIN.ECONOMICS.ORGANIZATIONS,
    );

    const row = adminPage.getByRole('row', { name: /Acme Inc/ });
    await expect(
      row.getByRole('link', { name: 'Open spending for Acme Inc' }),
    ).toHaveAttribute('href', '/admin/organizations/org-spend-1/spending');

    await row.getByRole('cell').nth(1).click();

    await expect(
      adminPage.getByRole('link', { name: 'Open spending', exact: true }),
    ).toHaveAttribute('href', '/admin/organizations/org-spend-1/spending');
  });

  test('organization Learning tab shows the prompt slot report for that organization', async ({
    adminPage,
  }) => {
    let requestedOrganization: string | null = null;
    await adminPage.route(
      createPlaywrightMockApiRoutePattern(
        'admin/content-learning/prompt-slots(?:\\?.*)?$',
      ),
      (route) => {
        requestedOrganization = new URL(route.request().url()).searchParams.get(
          'organizationId',
        );
        return route.fulfill({
          json: {
            data: {
              groups: [
                {
                  category: 'IMAGE',
                  comparison: {
                    alpha: 0.05,
                    comparisonCount: 1,
                    comparisons: [
                      {
                        difference: 0.7,
                        filled: { count: 25, mean: 0.5 },
                        lower: 0.4,
                        rest: { count: 25, mean: -0.2 },
                        slot: 'lighting',
                        upper: 1,
                        value: null,
                        verdict: 'better',
                      },
                    ],
                    excludedCount: 0,
                    observationCount: 50,
                  },
                  objective: 'engagement',
                  postCount: 50,
                },
              ],
              isPooled: false,
              isTruncated: false,
              organizationIds: ['org-learning-1'],
              postCount: 50,
              skipped: { noPrompt: 0, noSlots: 0, noValidReward: 0 },
            },
          },
        });
      },
    );

    await assertRouteRenders(
      adminPage,
      `${APP_ROUTES.ADMIN.ORGANIZATIONS}/org-learning-1/learning`,
    );

    await expect(
      adminPage.getByRole('main').getByRole('cell', { name: 'lighting' }),
    ).toBeVisible();
    await expect(adminPage.getByText('50 posts read.')).toBeVisible();
    expect(requestedOrganization).toBe('org-learning-1');
  });
});
