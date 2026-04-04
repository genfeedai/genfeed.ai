import {
  mockAdminStats,
  mockCrmAnalytics,
  mockCrmCompanies,
  mockCrmCompanyDetail,
  mockCrmLeads,
  mockCrmTasks,
  mockDarkroomCharacters,
  mockDarkroomGallery,
  mockDarkroomInfrastructure,
  mockOrganizationIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AdminPage } from '../../pages/admin.page';

/**
 * E2E Tests for Admin Content Management
 *
 * Covers darkroom and CRM sections.
 * All tests use adminPage fixture. All API calls are mocked.
 */
test.describe('Admin Content Management', () => {
  test.beforeEach(async ({ adminPage }) => {
    await mockAdminStats(adminPage);
  });

  test.describe('Darkroom', () => {
    test('should display darkroom gallery', async ({ adminPage }) => {
      await mockDarkroomGallery(adminPage, 8);

      const admin = new AdminPage(adminPage);
      await admin.gotoDarkroomGallery();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/darkroom\/gallery/);
    });

    test('should display characters list', async ({ adminPage }) => {
      await mockDarkroomCharacters(adminPage, 5);

      const admin = new AdminPage(adminPage);
      await admin.gotoDarkroomCharacters();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/darkroom\/characters/);
    });

    test('should display infrastructure surfaces', async ({ adminPage }) => {
      await mockDarkroomInfrastructure(adminPage);

      const admin = new AdminPage(adminPage);
      await admin.gotoDarkroomInfrastructure();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/darkroom\/infrastructure/);
      await expect(
        adminPage.locator('[data-testid="darkroom-fleet-services-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="darkroom-ec2-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="darkroom-cloudfront-surface"]'),
      ).toBeVisible();
    });
  });

  test.describe('CRM', () => {
    test('should show CRM leads list', async ({ adminPage }) => {
      await mockCrmLeads(adminPage, 6);

      const admin = new AdminPage(adminPage);
      await admin.gotoCrmLeads();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/leads/);
    });

    test('should display CRM companies', async ({ adminPage }) => {
      await mockCrmCompanies(adminPage, 4);

      const admin = new AdminPage(adminPage);
      await admin.gotoCrmCompanies();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/companies/);
    });

    test('should display CRM company detail surfaces', async ({
      adminPage,
    }) => {
      await mockCrmCompanyDetail(adminPage, 'company-1');
      await mockCrmLeads(adminPage, 4);

      await adminPage.goto('/crm/companies/company-1');
      const admin = new AdminPage(adminPage);

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/companies\/company-1/);
      await expect(
        adminPage.locator('[data-testid="crm-company-profile-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="crm-company-linked-leads-surface"]'),
      ).toBeVisible();
    });

    test('should display CRM tasks', async ({ adminPage }) => {
      await mockCrmTasks(adminPage, 5);
      await mockCrmLeads(adminPage, 3);
      await mockCrmCompanies(adminPage, 3);

      const admin = new AdminPage(adminPage);
      await admin.gotoCrmTasks();

      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/tasks/);
      await expect(
        adminPage.locator('[data-testid="crm-tasks-surface"]'),
      ).toBeVisible();
    });

    test('should navigate between CRM sections', async ({ adminPage }) => {
      await mockCrmLeads(adminPage);
      await mockCrmCompanies(adminPage);
      await mockCrmTasks(adminPage);
      await mockCrmAnalytics(adminPage);

      const admin = new AdminPage(adminPage);

      // Start at leads
      await admin.gotoCrmLeads();
      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/leads/);

      // Navigate to companies
      await admin.gotoCrmCompanies();
      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/companies/);

      // Navigate to tasks
      await admin.gotoCrmTasks();
      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/tasks/);

      // Navigate to CRM analytics
      await admin.gotoCrmAnalytics();
      await admin.assertPageVisible();
      await expect(adminPage).toHaveURL(/crm\/analytics/);
      await expect(
        adminPage.locator('[data-testid="crm-analytics-funnel-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="crm-analytics-velocity-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="crm-analytics-source-surface"]'),
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="crm-analytics-stage-surface"]'),
      ).toBeVisible();
    });
  });

  test.describe('Library', () => {
    test('should display admin voices library surfaces', async ({
      adminPage,
    }) => {
      await mockOrganizationIdentityDefaults(adminPage);

      await adminPage.goto('/library/voices');
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
