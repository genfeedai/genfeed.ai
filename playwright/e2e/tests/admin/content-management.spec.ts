import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockAdminStats,
  mockFleetCharacters,
  mockFleetGallery,
  mockFleetInfrastructure,
  mockOrganizationIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';

/**
 * E2E Tests for Admin Content Management
 *
 * Covers fleet and Library sections. Ghost CRM admin routes were removed
 * (no /admin/content/{leads,companies,tasks,analytics} pages).
 * All tests use adminPage fixture. All API calls are mocked.
 */
test.describe('Admin Content Management', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockAdminStats(adminPage);
  });

  test.describe('Fleet', () => {
    test('should display fleet gallery', async ({ adminPage }) => {
      await mockFleetGallery(adminPage, 8);

      const admin = new AdminPage(adminPage);
      await admin.gotoFleetGallery();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/fleet\/gallery/);
    });

    test('should display characters list', async ({ adminPage }) => {
      await mockFleetCharacters(adminPage, 5);

      const admin = new AdminPage(adminPage);
      await admin.gotoFleetCharacters();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/fleet\/characters/);
    });

    test('should display infrastructure surfaces', async ({ adminPage }) => {
      await mockFleetInfrastructure(adminPage);

      const admin = new AdminPage(adminPage);
      await admin.gotoFleetInfrastructure();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/fleet\/infrastructure/);
      await expect(
        adminPage.locator('[data-testid="fleet-services-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="fleet-ec2-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="fleet-cloudfront-surface"]'),
      ).toBeVisible();
    });
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
