import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';

/**
 * E2E Tests for Analytics Deep Pages
 *
 * Tests verify that analytics sub-pages (insights, hooks,
 * performance-lab, trend-turnover, posts) load correctly
 * with expected UI structure and elements.
 * All API calls are mocked.
 */
test.describe('Analytics Deep Pages', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Insights Page', () => {
    test('should display insights page with main content', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('insights');

      await expect(authenticatedPage).toHaveURL(/insights/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show charts or metric cards on insights', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('insights');
      await analyticsPage.waitForPageLoad();

      const hasCharts = await analyticsPage.chartContainer
        .first()
        .isVisible()
        .catch(() => false);
      const hasMetrics = await analyticsPage.metricCard
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        hasCharts || hasMetrics,
        'Expected charts or metric cards to be visible on insights page',
      ).toBe(true);
    });
  });

  test.describe('Hooks Page', () => {
    test('should display hooks performance page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('hooks');

      await expect(authenticatedPage).toHaveURL(/hooks/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show hook performance data or empty state', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.gotoSection('hooks');
      await analyticsPage.waitForPageLoad();

      // Hook items, table rows, or empty state should be present
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="hook-item"],' +
            ' table tbody tr,' +
            ' [data-testid="content-item"],' +
            ' .hook-card',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasItems || hasEmptyState,
        'Expected hook items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('Performance Lab Page', () => {
    test('should display performance lab page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/performance-lab');
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/performance-lab/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show comparison UI or content area', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/performance-lab');
      await analyticsPage.waitForPageLoad();

      // Performance lab should have comparison elements or charts
      const hasCharts = await analyticsPage.chartContainer
        .first()
        .isVisible()
        .catch(() => false);

      const hasComparison = await authenticatedPage
        .locator(
          '[data-testid="comparison"],' +
            ' [data-testid="pattern-lab"],' +
            ' .comparison-container',
        )
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        hasCharts || hasComparison,
        'Expected charts or comparison UI to be visible in performance lab',
      ).toBe(true);
    });
  });

  test.describe('Trend Turnover Page', () => {
    test('should display trend turnover page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/trend-turnover');
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/trend-turnover/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show trend analysis content', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/trend-turnover');
      await analyticsPage.waitForPageLoad();

      // Trend data, charts, or empty state
      const hasCharts = await analyticsPage.chartContainer
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasCharts || hasEmptyState,
        'Expected charts or empty state to be visible on trend turnover page',
      ).toBe(true);
    });
  });

  test.describe('Posts Analytics Page', () => {
    test('should display posts analytics page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/posts');
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/analytics\/posts/);
      await expect(analyticsPage.mainContent).toBeVisible();
    });

    test('should show analytics posts filters with the default platform selected', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/posts');
      await analyticsPage.waitForPageLoad();

      await expect(
        authenticatedPage.getByPlaceholder('Search posts...'),
      ).toBeVisible();

      const filters = authenticatedPage.getByRole('combobox');
      await expect(filters).toHaveCount(2);
      await expect(filters.nth(1)).toContainText('All');
    });

    test('should show post-level data or empty state', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await authenticatedPage.goto('/analytics/posts');
      await analyticsPage.waitForPageLoad();

      // Posts table rows, cards, or empty state
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="post-item"],' +
            ' [data-testid="content-item"],' +
            ' table tbody tr,' +
            ' .post-card',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasItems || hasEmptyState,
        'Expected post items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated user from analytics deep pages', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/analytics/insights');

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });

    test('should redirect unauthenticated user from performance lab', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/analytics/performance-lab');

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });
  });
});
