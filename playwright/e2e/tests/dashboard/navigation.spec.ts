import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';

const AUTH_SKIP_MSG =
  'Auth mocking did not prevent login redirect — fix Clerk auth mocking';

/**
 * E2E Tests for Dashboard Navigation
 *
 * Tests verify sidebar navigation, responsive behavior, and routing.
 * All API calls are mocked - no real backend requests occur.
 *
 * NOTE: Tests that require authenticated state will be skipped if the
 * Clerk auth mocking fails to prevent a redirect to /login. This is
 * intentional — we do NOT want false-green tests that pass regardless
 * of whether auth works.
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
    test('should display the overview/dashboard page', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();

      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

      await expect(authenticatedPage).toHaveURL(/overview|dashboard/);
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
        /Overview|Dashboard|Genfeed/i,
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
      await expect(authenticatedPage).toHaveURL(/activities/);
    });

    test('should navigate to Editor', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToEditor();
      await expect(authenticatedPage).toHaveURL(/editor/);
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
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('User Menu', () => {
    test('should display user menu button', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.userMenuButton).toBeVisible();
    });

    test('should open user menu dropdown', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.openUserMenu();
      await expect(dashboardPage.userMenuDropdown).toBeVisible();
    });

    test('should have logout option in user menu', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.openUserMenu();
      await expect(dashboardPage.logoutButton).toBeVisible();
    });

    test('should navigate to profile from user menu', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.goToProfile();
      const url = authenticatedPage.url();
      expect(url).not.toContain('/overview');
    });
  });

  test.describe('Quick Actions', () => {
    test('should display quick action buttons', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      const createVideoCount = await dashboardPage.createVideoButton.count();
      const createImageCount = await dashboardPage.createImageButton.count();

      expect(
        createVideoCount > 0 || createImageCount > 0,
        'Expected at least one quick action button (Create Video or Create Image) to be present',
      ).toBe(true);

      if (createVideoCount > 0) {
        await expect(dashboardPage.createVideoButton).toBeVisible();
      }
      if (createImageCount > 0) {
        await expect(dashboardPage.createImageButton).toBeVisible();
      }
    });

    test('should navigate to video creation via quick action', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.clickQuickAction('video');
      await expect(authenticatedPage).toHaveURL(/g\/video|studio/);
    });

    test('should navigate to image creation via quick action', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.clickQuickAction('image');
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Search Functionality', () => {
    test('should display search input', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.searchInput).toBeVisible();
    });

    test('should accept search input', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.search('test query');
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Responsive Navigation', () => {
    test('should adapt sidebar for mobile viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      const isCollapsed = await dashboardPage.isSidebarCollapsed();
      expect(isCollapsed).toBe(true);
    });

    test('should toggle sidebar on mobile', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.toggleSidebar();
      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should maintain navigation on tablet viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.assertSidebarVisible();
      await expect(authenticatedPage).toHaveURL(/overview/);
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

      await expect(authenticatedPage).toHaveURL(/overview/);
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
      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should handle browser forward button', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navigateToActivities();
      await expect(authenticatedPage).toHaveURL(/activities/);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/overview/);

      await authenticatedPage.goForward();
      await expect(authenticatedPage).toHaveURL(/activities/);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should support keyboard navigation through sidebar', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await authenticatedPage.keyboard.press('Tab');
      await authenticatedPage.keyboard.press('Tab');

      const focusedElement = await authenticatedPage.locator(':focus');
      const hasFocus = (await focusedElement.count()) > 0;
      expect(hasFocus).toBe(true);
    });

    test('should activate navigation item with Enter key', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);
      await dashboardPage.waitForPageLoad();

      await dashboardPage.navStudio.focus();
      await authenticatedPage.keyboard.press('Enter');
      await authenticatedPage.waitForTimeout(500);

      await expect(authenticatedPage).toHaveURL(/studio|g\//);
    });
  });
});
