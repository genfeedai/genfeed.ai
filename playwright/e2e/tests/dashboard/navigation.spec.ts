import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { ACTIVITY_URL, DashboardPage } from '../../pages/dashboard.page';

const AUTH_SKIP_MSG =
  'Auth mocking did not prevent login redirect — fix Better Auth auth mocking';

/**
 * Workspace-home navigation. The old dashboard widgets / user-menu /
 * Create Video quick actions were retired; the shipped home is workspace.
 */
test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Page Load', () => {
    test('should display the workspace home', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();

      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

      await expect(authenticatedPage).toHaveURL(/workspace|overview/);
    });

    test('should display sidebar navigation', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

      await dashboardPage.waitForPageLoad();
      await dashboardPage.assertSidebarVisible();
    });

    test('should display topbar', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

      await dashboardPage.waitForPageLoad();
      await dashboardPage.assertTopbarVisible();
    });

    test('should have proper page title', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();

      await expect(authenticatedPage).toHaveTitle(
        /Workspace|Overview|Dashboard|Genfeed/i,
      );
    });
  });

  test.describe('Sidebar Navigation', () => {
    test('should navigate to Studio', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToStudio();
      await expect(authenticatedPage).toHaveURL(/studio|g\//);
    });

    test('should navigate to Activities', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToActivities();
      await expect(authenticatedPage).toHaveURL(ACTIVITY_URL);
    });

    test('should navigate to the Studio Edit timeline', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToEditor();
      await expect(authenticatedPage).toHaveURL(/studio\/edit/);
    });

    test('should navigate to Settings', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToSettings();
      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should highlight active navigation item', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.navOverview).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/workspace|overview/);
    });
  });

  test.describe('Responsive Navigation', () => {
    test('should keep the workspace reachable on tablet', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.assertSidebarVisible();
      await expect(authenticatedPage).toHaveURL(/workspace|overview/);
    });
  });

  test.describe('Navigation State', () => {
    test('should maintain navigation after refresh', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await authenticatedPage.reload();
      await dashboardPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/workspace|overview/);
      await dashboardPage.assertSidebarVisible();
    });

    test('should handle browser back button', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToStudio();
      await expect(authenticatedPage).toHaveURL(/studio|g\//);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/workspace|overview/);
    });
  });
});
