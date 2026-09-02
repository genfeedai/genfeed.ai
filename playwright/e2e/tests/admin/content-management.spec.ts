import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockAdminStats,
  mockOrganizationIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';

/**
 * E2E Tests for Admin Content Management
 *
 * Covers analytics and Library sections. Ghost CRM admin routes were removed
 * (no /admin/content/{leads,companies,tasks,analytics} pages).
 * All tests use adminPage fixture. All API calls are mocked.
 */
test.describe('Admin Content Management', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockAdminStats(adminPage);
  });

  test.describe('Platform analytics', () => {
    test('should open overview analytics all under /admin', async ({
      adminPage,
    }) => {
      const admin = new AdminPage(adminPage);
      await admin.gotoAnalyticsAll();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/\/admin\/overview\/analytics\/all/);
    });
  });

  test.describe('Library', () => {
    test('should display admin voices library surfaces', async ({
      adminPage,
    }) => {
      await mockOrganizationIdentityDefaults(adminPage);

      await adminPage.goto(APP_ROUTES.ADMIN.LIBRARY.VOICES);
      const admin = new AdminPage(adminPage);

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/library\/voices/);
      await expect(
        adminPage.locator('[data-testid="voices-library-controls-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="voices-library-results-surface"]'),
      ).toBeVisible();
    });
  });
});
