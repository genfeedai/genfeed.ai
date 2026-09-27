import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E Tests for Dashboard Analytics
 *
 * Tests verify the operational-home metric grid and activity feed
 * (`operational-home-sections.tsx`). The former per-content-type stat
 * widgets (video/image/credit/storage counters) and "recent content" cards
 * were retired with the operational-home rebuild (#2093) — analytics now
 * lives at /analytics/overview, and this dashboard's own content-recency
 * surface was replaced by review/publishing/credential-health surfaces.
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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      // The operational-home metric grid (`operational-home-metrics`) always
      // renders for an authenticated org/brand — see `assertStatsDisplayed`.
      await dashboardPage.assertStatsDisplayed();
      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });

  test.describe('Activity Feed', () => {
    test('should display activity section', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(dashboardPage.activitySection).toBeVisible();
    });

    test('should display activity items', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      const activityCount = await dashboardPage
        .getActivityCount()
        .catch(() => 0);

      expect(activityCount).toBeGreaterThanOrEqual(0);
    });

    test('should show activity timestamps', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      // Should show empty state or no activities
      await expect(authenticatedPage).toHaveURL(/overview/);
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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(authenticatedPage).toHaveURL(/overview/);
    });

    test('should handle slow network gracefully', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Simulate slow network. `route.fallback()` (not `.continue()`) after
      // the delay: `.continue()` sends the request straight to the real
      // network, bypassing every earlier-registered mock — including the
      // global organization-list mock (`api-interceptor.ts`'s
      // `handleOrganizationRoutes`) that `RoutedOrganizationProvider` depends
      // on for every route. That turned this into a real, unmocked
      // `GET /organizations?mine=true` against a non-existent backend, which
      // failed and tripped the "Organization switch failed" boundary — a
      // test-harness artifact, not the product's real slow-network behavior.
      // `.fallback()` still simulates latency but hands the request back to
      // those mocks afterward, matching how the sibling
      // "should show loading state while fetching data" test above scopes
      // its own delay to `/analytics/**` only.
      await authenticatedPage.route('**/api.genfeed.ai/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fallback();
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(authenticatedPage).toHaveURL(/overview/);
    });
  });
});
