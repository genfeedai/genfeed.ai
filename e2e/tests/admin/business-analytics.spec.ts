import {
  mockAdminStats,
  mockBusinessAnalytics,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';

/**
 * E2E Tests for Admin Business Analytics Dashboard
 *
 * Covers the /overview/analytics/business route.
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
    await expect(adminPage).toHaveURL(/overview\/analytics\/business/);
  });

  test('renders revenue KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    // KPI section heading
    await expect(
      adminPage.getByRole('heading', { name: /revenue/i }).first(),
    ).toBeVisible();
  });

  test('renders credits KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    await expect(
      adminPage.getByRole('heading', { name: /credits/i }).first(),
    ).toBeVisible();
  });

  test('renders ingredients KPI section', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    await expect(
      adminPage.getByRole('heading', { name: /ingredients/i }).first(),
    ).toBeVisible();
  });

  test('renders daily revenue chart', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    await expect(
      adminPage.getByRole('heading', { name: /daily revenue/i }).first(),
    ).toBeVisible();
  });

  test('renders daily ingredients chart', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    await expect(
      adminPage.getByRole('heading', { name: /daily ingredients/i }).first(),
    ).toBeVisible();
  });

  test('renders comparisons section with cards', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

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
  });

  test('renders projections section labeled as estimates', async ({
    adminPage,
  }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

    await expect(
      adminPage.getByRole('heading', { name: /projections/i }).first(),
    ).toBeVisible();

    // Projection card should note they are estimates
    await expect(
      adminPage.getByText(/estimates based on recent weekly growth/i),
    ).toBeVisible();
  });

  test('renders top organizations leader tables', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsBusiness();
    await admin.waitForPageLoad();

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

    // Mocked org names from the fixture should appear
    const body = await adminPage.textContent('body');
    expect(body).toContain('Acme Corp');
    expect(body).toContain('Globex Inc');
  });

  test('business analytics tab is accessible from analytics nav', async ({
    adminPage,
  }) => {
    const admin = new AdminPage(adminPage);
    // Navigate to overview analytics first, then click Business tab
    await adminPage.goto('/overview/analytics/all', {
      waitUntil: 'domcontentloaded',
    });
    await admin.waitForPageLoad();

    const businessTab = adminPage.getByRole('link', { name: /business/i });
    await expect(businessTab).toBeVisible();
    await businessTab.click();

    await admin.waitForPageLoad();
    await expect(adminPage).toHaveURL(/overview\/analytics\/business/);
  });
});
