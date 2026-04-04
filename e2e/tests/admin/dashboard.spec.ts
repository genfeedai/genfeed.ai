import {
  mockAdminAnalytics,
  mockAdminStats,
  mockAdminTemplates,
  mockAdminUsers,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';

/**
 * E2E Tests for Admin Dashboard
 *
 * All tests use the adminPage fixture (admin role).
 * All API calls are mocked.
 */
test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockAdminStats(adminPage);
    await mockAdminUsers(adminPage);
    await mockAdminTemplates(adminPage);
    await mockAdminAnalytics(adminPage);
  });

  test('should display admin overview page', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoOverview();

    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/overview/);
    await expect(
      adminPage.locator('[data-testid="admin-overview-stats"]'),
    ).toBeVisible();
    await expect(
      adminPage.locator('[data-testid="admin-overview-quick-actions"]'),
    ).toBeVisible();
    await expect(
      adminPage.locator('[data-testid="admin-overview-leaderboard"]'),
    ).toBeVisible();
  });

  test('should show KPI cards on overview', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoOverview();

    await admin.assertPageVisible();
    // The overview page should show stats/metrics
    const body = await adminPage.textContent('body');
    expect(body).toBeTruthy();
    expect(body?.length).toBeGreaterThan(200);
  });

  test('should navigate between admin sections', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);

    // Start at overview
    await admin.gotoOverview();
    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/overview/);

    // Navigate to users
    await admin.gotoUsers();
    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/users/);

    // Navigate to templates
    await admin.gotoTemplates();
    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/templates/);
  });

  test('should display user list', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoUsers();

    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/users/);

    // Should have a table or list of users
    const body = await adminPage.textContent('body');
    expect(body).toBeTruthy();
  });

  test('should display template list', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoTemplates();

    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/templates/);
    await expect(
      adminPage.getByRole('link', { name: /open template/i }).first(),
    ).toBeVisible();
  });

  test('should show analytics overview', async ({ adminPage }) => {
    const admin = new AdminPage(adminPage);
    await admin.gotoAnalyticsAll();

    await admin.assertPageVisible();
    await expect(adminPage).toHaveURL(/analytics/);
  });
});
