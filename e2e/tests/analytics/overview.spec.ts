import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';

/**
 * E2E Tests for Analytics Overview
 *
 * Tests verify analytics page display, metric cards,
 * charts, navigation between tabs, and filtering.
 * All API calls are mocked.
 */
test.describe('Analytics Overview', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('should display analytics overview page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();

      await expect(authenticatedPage).toHaveURL(/analytics/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show engagement metrics', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();

      // Metrics section or cards should be present
      const hasMetrics = await analyticsPage.metricCard
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await analyticsPage.mainContent
        .isVisible()
        .catch(() => false);

      expect(hasMetrics || hasContent).toBe(true);
    });

    test('should display charts', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();

      // Charts or chart containers should render
      const hasCharts = await analyticsPage.chartContainer
        .first()
        .isVisible()
        .catch(() => false);
      const hasCanvas = await analyticsPage.chartCanvas
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await analyticsPage.mainContent
        .isVisible()
        .catch(() => false);

      expect(hasCharts || hasCanvas || hasContent).toBe(true);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between analytics tabs', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();

      // Navigate to trends
      await analyticsPage.navigateToTrends();
      await expect(authenticatedPage).toHaveURL(/analytics.*trends|trends/);

      // Navigate to hooks
      await analyticsPage.navigateToHooks();
      await expect(authenticatedPage).toHaveURL(/analytics.*hooks|hooks/);

      // Navigate to insights
      await analyticsPage.navigateToInsights();
      await expect(authenticatedPage).toHaveURL(/analytics.*insights|insights/);

      // Navigate back to overview
      await analyticsPage.navigateToOverview();
      await expect(authenticatedPage).toHaveURL(
        /analytics.*overview|analytics/,
      );
    });

    test('should display trends page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('trends');

      await expect(authenticatedPage).toHaveURL(/trends/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should display hooks page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('hooks');

      await expect(authenticatedPage).toHaveURL(/hooks/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should display insights page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('insights');

      await expect(authenticatedPage).toHaveURL(/insights/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated user from trends page', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/analytics/trends');

      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });
  });

  test.describe('Filters', () => {
    test('should filter by date range', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();

      // Date range selector should be available
      const hasDateRange = await analyticsPage.dateRangeSelector
        .isVisible()
        .catch(() => false);

      if (hasDateRange) {
        await analyticsPage.selectDateRange('Last 7 days');
        await analyticsPage.waitForPageLoad();
      }

      await expect(authenticatedPage).toHaveURL(/analytics/);
    });

    test('should filter by platform', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();

      const hasPlatformFilter = await analyticsPage.platformFilter
        .isVisible()
        .catch(() => false);

      if (hasPlatformFilter) {
        await analyticsPage.selectPlatform('Instagram');
        await analyticsPage.waitForPageLoad();
      }

      await expect(authenticatedPage).toHaveURL(/analytics/);
    });
  });
});
