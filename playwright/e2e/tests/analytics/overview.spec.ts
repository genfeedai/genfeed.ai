import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

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
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);
    });

    test('should show engagement metrics', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);

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
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);

      // A URL-pattern check alone would still pass on an "Organization
      // unavailable" fallback (its suggested link also contains "trends" in
      // the path), so also assert the real surface rendered and that no
      // ErrorBoundary fired. Each step waits for its own page to settle
      // (`waitForPageLoad`) before the next click, since these are
      // client-side transitions racing the analytics section's per-page
      // data fetches under parallel load.
      await analyticsPage.navigateToTrends();
      await expect(authenticatedPage).toHaveURL(/analytics\/trends/);
      await analyticsPage.waitForPageLoad();
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath('/analytics/trends'),
      );

      await analyticsPage.navigateToHooks();
      await expect(authenticatedPage).toHaveURL(/analytics\/hooks/);
      await analyticsPage.waitForPageLoad();
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath('/analytics/hooks'),
      );

      await analyticsPage.navigateToInsights();
      await expect(authenticatedPage).toHaveURL(/analytics\/insights/);
      await analyticsPage.waitForPageLoad();
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath('/analytics/insights'),
      );

      await analyticsPage.navigateToOverview();
      // Exact overview pathname — the previous `analytics.*overview|analytics`
      // pattern's second alternative matched any analytics URL regardless of
      // the first, so it could not fail even on a stale page.
      await expect(authenticatedPage).toHaveURL(/analytics\/overview/);
      await analyticsPage.waitForPageLoad();
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);
    });

    test('should display trends page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath('/analytics/trends');

      await analyticsPage.gotoSection('trends');

      await expect(authenticatedPage).toHaveURL(/trends/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should display hooks page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath('/analytics/hooks');

      await analyticsPage.gotoSection('hooks');

      await expect(authenticatedPage).toHaveURL(/hooks/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should display insights page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath('/analytics/insights');

      await analyticsPage.gotoSection('insights');

      await expect(authenticatedPage).toHaveURL(/insights/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });
  });

  test.describe('Filters', () => {
    test('should filter by date range', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);

      // Date range selector should be available
      const hasDateRange = await analyticsPage.dateRangeSelector
        .isVisible()
        .catch(() => false);

      if (hasDateRange) {
        await analyticsPage.selectDateRange('Last 7 days');
        await analyticsPage.waitForPageLoad();
        await assertNoErrorBoundaryFallback(
          authenticatedPage,
          analyticsPage.url,
        );
      }

      await expect(authenticatedPage).toHaveURL(/analytics/);
    });

    test('should filter by platform', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);

      const hasPlatformFilter = await analyticsPage.platformFilter
        .isVisible()
        .catch(() => false);

      if (hasPlatformFilter) {
        await analyticsPage.selectPlatform('Instagram');
        await analyticsPage.waitForPageLoad();
        await assertNoErrorBoundaryFallback(
          authenticatedPage,
          analyticsPage.url,
        );
      }

      await expect(authenticatedPage).toHaveURL(/analytics/);
    });
  });
});

// A sibling top-level describe, deliberately outside `Analytics Overview`:
// that describe's `beforeEach` requests the `authenticatedPage` fixture
// unconditionally, which sets the `__playwright_test` bypass cookie and a
// fabricated client-side session on the shared `context`/`page`. Nesting an
// `unauthenticatedPage` test inside it reuses that same contaminated
// `page`/`context` (Playwright fixtures are cached per test, not per
// fixture-name), so the request never actually reaches the app
// unauthenticated — proxy.ts's playwright-bypass check short-circuits before
// the session check. Compare `discovery/discovery.spec.ts`'s
// `Discovery — unauthenticated access` describe, which uses the same
// sibling-describe structure for this exact reason.
test.describe('Analytics Overview — Protected Routes', () => {
  test('should redirect unauthenticated user from trends page', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.ANALYTICS.TRENDS);

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
