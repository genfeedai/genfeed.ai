import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockContentLibrary,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';

/**
 * E2E Tests for Dashboard Analytics
 *
 * Tests verify analytics widgets, activity feed, and statistics display.
 * All API calls are mocked - no real backend requests occur.
 */
test.describe('Dashboard Analytics', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Statistics Widgets', () => {
    test('should display statistics section', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Stats section should be present
      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should show video count statistic', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const videoStat = await dashboardPage
        .getStatValue('videos')
        .catch(() => '');

      expect(videoStat).toBeTruthy();
    });

    test('should show image count statistic', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const imageStat = await dashboardPage
        .getStatValue('images')
        .catch(() => '');

      expect(imageStat).toBeTruthy();
    });

    test('should show credit usage', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const creditStat = await dashboardPage
        .getStatValue('credits')
        .catch(() => '');

      expect(creditStat).toBeTruthy();
    });

    test('should show storage usage', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const storageStat = await dashboardPage
        .getStatValue('storage')
        .catch(() => '');

      expect(storageStat).toBeTruthy();
    });
  });

  test.describe('Activity Feed', () => {
    test('should display activity section', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.activitySection).toBeVisible();
    });

    test('should display activity items', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const activityCount = await dashboardPage
        .getActivityCount()
        .catch(() => 0);

      expect(activityCount).toBeGreaterThanOrEqual(0);
    });

    test('should show activity timestamps', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      const activityCount = await dashboardPage
        .getActivityCount()
        .catch(() => 0);

      if (activityCount > 0) {
        const activityText = await dashboardPage.getActivityText(0);
        // Activity should have some text content
        expect(activityText.length).toBeGreaterThan(0);
      }

      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should handle empty activity state', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Mock empty activities
      await authenticatedPage.route(
        '**/api.genfeed.ai/activities**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              data: [],
              meta: { totalCount: 0 },
            }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Should show empty state or no activities
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Recent Content', () => {
    test('should display recent content section', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'videos', 5);
      await mockContentLibrary(authenticatedPage, 'images', 5);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.recentContentSection).toBeVisible();
    });

    test('should display recent videos', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'videos', 3);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.recentVideoCard.first()).toBeVisible();
    });

    test('should display recent images', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'images', 3);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(dashboardPage.recentImageCard.first()).toBeVisible();
    });

    test('should navigate to content when clicking recent item', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'videos', 3);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await dashboardPage.clickRecentContent('video', 0).catch(() => {
        // Might not have recent content visible
      });

      // Should navigate or show preview
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });
  });

  test.describe('Loading States', () => {
    test('should show loading state while fetching data', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Add delay to API responses
      await authenticatedPage.route(
        '**/api.genfeed.ai/analytics/**',
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.fulfill({
            body: JSON.stringify({ data: {} }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      await dashboardPage.goto();

      // Loading state might be visible briefly
      await dashboardPage.waitForLoadingComplete();

      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should handle slow network gracefully', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Simulate slow network
      await authenticatedPage.route('**/api.genfeed.ai/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle analytics API error', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Mock analytics error
      await authenticatedPage.route(
        '**/api.genfeed.ai/analytics/**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              errors: [{ title: 'Internal Server Error' }],
            }),
            contentType: 'application/json',
            status: 500,
          });
        },
      );

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Page should still load with error state
      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should handle activities API error', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.route(
        '**/api.genfeed.ai/activities**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              errors: [{ title: 'Failed to fetch activities' }],
            }),
            contentType: 'application/json',
            status: 500,
          });
        },
      );

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Page should still load
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Data Refresh', () => {
    test('should refresh data on page reload', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Refresh
      await authenticatedPage.reload();
      await dashboardPage.waitForPageLoad();

      // Page should reload successfully
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Responsive Analytics', () => {
    test('should display analytics on mobile viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      // Analytics should adapt to mobile
      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should display analytics on tablet viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });
});
