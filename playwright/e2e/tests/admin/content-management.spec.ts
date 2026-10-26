import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
      // Catalog controls are the shared subbar (collapsed search, Filters
      // menu with the provider facet, sync actions), not a titled surface.
      await adminPage.getByRole('button', { name: /^Filters/ }).click();
      await expect(
        adminPage.getByRole('menuitem', { name: /^Provider/ }),
      ).toBeVisible();
      await adminPage.keyboard.press('Escape');
      await expect(
        adminPage.getByRole('button', { name: 'Sync All' }),
      ).toBeVisible();
      // Results are the catalog table inside the voices list, or its empty
      // state when the catalog has no voices.
      const voicesList = adminPage.getByTestId('voices-list');
      await expect(voicesList).toBeVisible();
      await expect(
        voicesList.getByRole('table').or(voicesList.getByTestId('table-empty')),
      ).toBeVisible();
    });
  });
});
