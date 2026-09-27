import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import {
  mockAdminStats,
  mockBusinessAnalytics,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/** A KPI tile (`MetricCard`) in the given `KPISection`, by its label. */
function kpi(page: Page, section: string, label: string): Locator {
  return page
    .locator('main')
    .locator('div.mb-6')
    .filter({ has: page.getByRole('heading', { exact: true, name: section }) })
    .getByTestId('metric-card')
    .filter({ hasText: label });
}

/**
 * E2E Tests for Admin Business Analytics Dashboard
 *
 * Covers the /admin/overview/analytics/business route.
 * Verifies KPI sections, daily charts, comparison cards,
 * projections, and top-organization leader tables.
 * All API calls are mocked.
 */
test.describe('Admin Business Analytics', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockAdminStats(adminPage);
    await mockBusinessAnalytics(adminPage);
  });

  test('loads the business analytics page', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();

    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/admin\/overview\/analytics\/business/);
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );
    await expect(
      adminPage.getByText('No business analytics data available.'),
    ).toHaveCount(0);
    await expect(kpi(adminPage, 'Revenue', 'Today')).toContainText('$1,234');
  });

  test('renders revenue KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    // KPI section values from `mockBusinessAnalytics` — the section title
    // alone renders even while the query is loading.
    const today = kpi(adminPage, 'Revenue', 'Today');
    await expect(today).toContainText('$1,234');
    await expect(today).toContainText('+5.2%');
    await expect(kpi(adminPage, 'Revenue', 'Last 7 Days')).toContainText(
      '$8,765',
    );
    await expect(kpi(adminPage, 'Revenue', 'Last 30 Days')).toContainText(
      '$34,567',
    );
    await expect(kpi(adminPage, 'Revenue', 'Month to Date')).toContainText(
      '$12,345',
    );
  });

  test('renders credits KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    await expect(kpi(adminPage, 'Credits', 'Credits Sold')).toContainText(
      '50K',
    );
    await expect(kpi(adminPage, 'Credits', 'Credits Sold')).toContainText(
      '+8.1%',
    );
    await expect(kpi(adminPage, 'Credits', 'Credits Consumed')).toContainText(
      '42K',
    );
  });

  test('renders ingredients KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    const section = 'Ingredients Generated';
    await expect(kpi(adminPage, section, 'Today')).toContainText('1.3K');
    await expect(kpi(adminPage, section, 'Last 7 Days')).toContainText('8.8K');
    await expect(kpi(adminPage, section, 'Last 30 Days')).toContainText('38K');
  });

  test('renders daily revenue chart', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    // One bar per day of the fixture's 30-day series (bar values are
    // randomized, so assert the series length and range, not amounts).
    const chart = adminPage
      .locator('main')
      .locator('div.p-4')
      .filter({
        has: adminPage.getByRole('heading', { name: 'Daily Revenue (30d)' }),
      });
    await expect(chart.locator('[title*=": $"]')).toHaveCount(30);
    await expect(chart).not.toContainText('No data available');
  });

  test('renders daily ingredients chart', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    const chart = adminPage
      .locator('main')
      .locator('div.p-4')
      .filter({
        has: adminPage.getByRole('heading', {
          name: 'Daily Ingredients (30d)',
        }),
      });
    await expect(chart.locator('[title*=": "]')).toHaveCount(30);
    await expect(chart).not.toContainText('No data available');
  });

  test('renders comparisons section with cards', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    await expect(
      adminPage.getByRole('heading', { name: /comparisons/i }).first(),
    ).toBeVisible();

    await expect(
      adminPage.getByRole('heading', { name: /cash in vs usage value/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { name: /credits sold vs consumed/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { name: /outstanding prepaid/i }),
    ).toBeVisible();
    // Values unique to the comparison cards (cash-in also appears as the
    // 30-day revenue KPI, so assert the usage value instead).
    const main = adminPage.locator('main');
    await expect(main).toContainText('$28,000');
    await expect(main).toContainText('$8,000');
  });

  test('renders projections section labeled as estimates', async ({
    adminPage,
  }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    await expect(
      adminPage.getByRole('heading', { name: /projections/i }).first(),
    ).toBeVisible();

    // Projection card should note they are estimates
    await expect(
      adminPage.getByText(/estimates based on recent weekly growth/i),
    ).toBeVisible();
    await expect(adminPage.locator('main')).toContainText('$45,000');
    await expect(
      adminPage.getByText('Insufficient data for projections', {
        exact: false,
      }),
    ).toHaveCount(0);
  });

  test('renders top organizations leader tables', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    await expect(
      adminPage.getByRole('heading', { name: /top organizations/i }).first(),
    ).toBeVisible();

    // Leader table sub-headings
    await expect(
      adminPage.getByRole('heading', { name: /by revenue/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { name: /by credits consumed/i }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('heading', { name: /by ingredients/i }),
    ).toBeVisible();
  });

  test('renders organization names in leader tables', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );

    // Each leader row pairs a mocked org with its formatted metric. The
    // tables load asynchronously (`useQuery`), so these assertions retry.
    const rows = adminPage.locator('main').getByRole('row');
    const leaderRow = (org: string, value: string) =>
      rows.filter({ hasText: org }).filter({ hasText: value });
    await expect(leaderRow('Acme Corp', '$2,500')).toHaveCount(1);
    await expect(leaderRow('Globex Inc', '$1,800')).toHaveCount(1);
    await expect(leaderRow('Acme Corp', '12K')).toHaveCount(1);
    await expect(leaderRow('Globex Inc', '9.5K')).toHaveCount(1);
    await expect(leaderRow('Acme Corp', '5K')).toHaveCount(1);
    await expect(leaderRow('Initech LLC', '3.8K')).toHaveCount(1);
  });

  test('business analytics tab is accessible from analytics nav', async ({
    adminPage,
  }) => {
    const admin = new AdminPage(adminPage);
    // Navigate to overview analytics first, then click Business tab
    await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ALL, {
      waitUntil: 'domcontentloaded',
    });
    await admin.waitForPageLoad();
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ALL,
    );

    const businessTab = adminPage.getByRole('link', { name: /business/i });
    await expect(businessTab).toBeVisible();
    await businessTab.click();

    await admin.waitForPageLoad();
    await expect(adminPage).toHaveURL(/admin\/overview\/analytics\/business/);
    await assertNoErrorBoundaryFallback(
      adminPage,
      APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BUSINESS,
    );
    await expect(kpi(adminPage, 'Revenue', 'Today')).toContainText('$1,234');
  });
});
