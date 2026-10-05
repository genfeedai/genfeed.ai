import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAnalytics,
  IBrandWithStats,
  ITimeSeriesApiDataPoint,
  ITimeSeriesPlatformMetricsResponse,
} from '@genfeedai/contracts/interfaces';
import type { Locator, Page } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
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

const OVERVIEW_ROUTE = brandPath(APP_ROUTES.ANALYTICS.OVERVIEW);

// `GET /organizations/:id/analytics` (`AnalyticSerializer` over
// `AnalyticsAggregationService.getOverviewMetrics` + the connected-credential
// count) — the overview KPI source.
const ORGANIZATION_ANALYTICS = createPlaywrightApiRoutePattern(
  'organizations/[^/]+/analytics\\?',
);
// `GET /analytics/timeseries` (`AnalyticsTimeseriesWithPlatformsSerializer`
// over `AnalyticsService.getTimeSeriesData`) — the chart source.
const ANALYTICS_TIMESERIES = createPlaywrightApiRoutePattern(
  'analytics/timeseries\\?',
);

// Period sums `getOverviewMetrics` reads from `post_analytics`. Engagement
// is likes + comments + shares + saves, and the rate divides it by views
// (pinned in analytics-aggregation.service.spec.ts; genfeedai/genfeed.ai#5427).
const PERIOD_TOTALS = {
  totalComments: 96,
  totalLikes: 640,
  totalSaves: 28,
  totalShares: 60,
  totalViews: 12450,
};
const PERIOD_ENGAGEMENT =
  PERIOD_TOTALS.totalLikes +
  PERIOD_TOTALS.totalComments +
  PERIOD_TOTALS.totalShares +
  PERIOD_TOTALS.totalSaves;
const PERIOD_ENGAGEMENT_RATE =
  (PERIOD_ENGAGEMENT / PERIOD_TOTALS.totalViews) * 100;

const ORGANIZATION_METRICS: Partial<IAnalytics> = {
  ...PERIOD_TOTALS,
  activePlatforms: ['instagram', 'tiktok'],
  avgEngagementRate: PERIOD_ENGAGEMENT_RATE,
  bestPerformingPlatform: 'instagram',
  engagementGrowth: 16,
  totalBrands: 1,
  // `CredentialsService.countConnected` (genfeedai/genfeed.ai#5426).
  totalCredentialsConnected: 3,
  totalEngagement: PERIOD_ENGAGEMENT,
  totalPosts: 18,
  viewsGrowth: 21,
};

function platformMetrics(views: number): ITimeSeriesPlatformMetricsResponse {
  return {
    comments: 2,
    engagementRate: 4.2,
    likes: Math.round(views / 20),
    saves: 1,
    shares: 3,
    views,
  };
}

const TIMESERIES: ITimeSeriesApiDataPoint[] = [
  {
    date: '2026-03-03',
    instagram: platformMetrics(1200),
    tiktok: platformMetrics(800),
  },
  {
    date: '2026-03-04',
    instagram: platformMetrics(2400),
    tiktok: platformMetrics(1500),
  },
];

async function mockOverviewData(page: Page): Promise<string[]> {
  const kpiRequests: string[] = [];
  await page.route(ORGANIZATION_ANALYTICS, async (route) => {
    kpiRequests.push(route.request().url());
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: ORGANIZATION_METRICS,
          id: 'mock-org-id-e2e-test',
          type: 'analytic',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  // `GET /analytics/brands/leaderboard` is a collection; the org has no
  // ranked brands here, which keeps the leaderboards out of these tests.
  await page.route(
    createPlaywrightApiRoutePattern('analytics/brands/leaderboard\\?'),
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
  await page.route(ANALYTICS_TIMESERIES, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: TIMESERIES.map((point) => ({
          attributes: point,
          id: point.date,
          type: 'analytics-timeseries-with-platforms',
        })),
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  return kpiRequests;
}

/**
 * The organization-wide overview's own sources: `GET /analytics/brands`
 * (`AnalyticsBrandStatsSerializer`: `{ data: IBrandWithStats[], pagination }`)
 * and `GET /analytics/platforms` (a collection; no rows here — its client
 * mapping is tracked separately in genfeedai/genfeed.ai#5419). The KPI strip
 * reuses `ORGANIZATION_ANALYTICS`.
 */
async function mockOrganizationOverviewData(page: Page): Promise<void> {
  const brand: IBrandWithStats = {
    activePlatforms: ['instagram', 'tiktok'],
    avgEngagementRate: PERIOD_ENGAGEMENT_RATE,
    growth: 12,
    id: 'brand-1',
    name: 'Brand 1',
    organizationId: 'mock-org-id-e2e-test',
    organizationName: 'Test Organization',
    totalEngagement: PERIOD_ENGAGEMENT,
    totalPosts: 18,
    totalViews: PERIOD_TOTALS.totalViews,
  };
  await page.route(
    createPlaywrightApiRoutePattern('analytics/brands\\?'),
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              data: [brand],
              pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
            },
            id: 'analytics-brands',
            type: 'analytics-brand-stats',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
  await page.route(
    createPlaywrightApiRoutePattern('analytics/platforms\\?'),
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

function kpiCard(page: Page, label: string): Locator {
  return page
    .locator('main')
    .getByTestId('metric-card')
    .filter({ hasText: label });
}

function dateParams(url: string): { endDate: string; startDate: string } {
  const params = new URL(url).searchParams;
  return {
    endDate: params.get('endDate') ?? '',
    startDate: params.get('startDate') ?? '',
  };
}

function daysBetween(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(endDate) - Date.parse(startDate)) / (24 * 60 * 60 * 1000),
  );
}

test.describe('Analytics Overview', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('should show the connect-accounts empty state without analytics data', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const kpiRequests: string[] = [];
      // A valid org with nothing connected or published yet.
      await authenticatedPage.route(ORGANIZATION_ANALYTICS, async (route) => {
        kpiRequests.push(route.request().url());
        await route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                activePlatforms: [],
                avgEngagementRate: 0,
                engagementGrowth: 0,
                totalCredentialsConnected: 0,
                totalEngagement: 0,
                totalPosts: 0,
                totalViews: 0,
                viewsGrowth: 0,
              } satisfies Partial<IAnalytics>,
              id: 'mock-org-id-e2e-test',
              type: 'analytic',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await analyticsPage.goto();

      await expect(authenticatedPage).toHaveURL(/analytics\/overview/);
      await expect(
        analyticsPage.sectionHeading('Connect accounts to see analytics'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('button', { name: /connect accounts/i }),
      ).toBeVisible();
      await expect(
        authenticatedPage.locator('main').getByTestId('metric-card'),
      ).toHaveCount(0);
      expect(kpiRequests.length).toBeGreaterThan(0);
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);
    });

    test('should show engagement metrics', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const kpiRequests = await mockOverviewData(authenticatedPage);

      await authenticatedPage.goto(OVERVIEW_ROUTE);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, OVERVIEW_ROUTE);

      // Active dashboard: primary KPIs, then connected accounts + platforms.
      await expect(kpiCard(authenticatedPage, 'Total Posts')).toContainText(
        '18',
      );
      const views = kpiCard(authenticatedPage, 'Total Views');
      await expect(views).toContainText('12450');
      await expect(views).toContainText('+21%');
      const engagement = kpiCard(authenticatedPage, 'Total Engagement');
      // 640 + 96 + 60 + 28 = 824; 824 / 12450 = 6.62%.
      await expect(engagement).toContainText('824');
      await expect(engagement).toContainText('+16%');
      await expect(
        kpiCard(authenticatedPage, 'Avg Engagement Rate'),
      ).toContainText('6.62%');
      await expect(
        kpiCard(authenticatedPage, 'Connected Accounts'),
      ).toContainText('3');
      await expect(
        kpiCard(authenticatedPage, 'Active Platforms'),
      ).toContainText('2');
      await expect(
        authenticatedPage.getByText('Connect accounts to see analytics'),
      ).toHaveCount(0);
      expect(kpiRequests.length).toBeGreaterThan(0);
    });

    test('should display charts', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      await mockOverviewData(authenticatedPage);

      await authenticatedPage.goto(OVERVIEW_ROUTE);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, OVERVIEW_ROUTE);

      const chartCard = authenticatedPage.getByTestId(
        'analytics-overview-timeseries',
      );
      await expect(chartCard).toBeVisible();
      await expect(chartCard).toContainText(
        'Posts views by platform over time',
      );
      await expect(
        chartCard.getByRole('button', { exact: true, name: 'Instagram' }),
      ).toBeVisible();
      await expect(
        chartCard.getByRole('button', { exact: true, name: 'TikTok' }),
      ).toBeVisible();
      await expect(chartCard.locator('svg.recharts-surface')).toBeVisible();
      await expect(
        authenticatedPage.getByText('No performance trends yet'),
      ).toHaveCount(0);
      await expect(
        authenticatedPage.getByText(
          'Trend lines will appear here once performance data lands',
        ),
      ).toHaveCount(0);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between analytics tabs', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      await mockOverviewData(authenticatedPage);

      await analyticsPage.goto();
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, analyticsPage.url);
      await expect(kpiCard(authenticatedPage, 'Total Posts')).toContainText(
        '18',
      );

      await analyticsPage.navigateToHooks();
      await expect(authenticatedPage).toHaveURL(/analytics\/hooks/);
      await analyticsPage.waitForPageLoad();
      await expect(analyticsPage.sectionHeading('Viral Hooks')).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath('/analytics/hooks'),
      );

      await analyticsPage.navigateToInsights();
      await expect(authenticatedPage).toHaveURL(/analytics\/insights/);
      await analyticsPage.waitForPageLoad();
      await expect(
        analyticsPage.sectionHeading('Social intelligence inbox'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath('/analytics/insights'),
      );

      // The section nav's "Overview" is the organization-wide analytics
      // overview (`/:orgSlug/~/analytics/overview`,
      // `AnalyticsOrganizationOverview`), not the brand overview.
      await mockOrganizationOverviewData(authenticatedPage);
      await analyticsPage.navigateToOverview();
      // Exact overview pathname — the previous `analytics.*overview|analytics`
      // pattern's second alternative matched any analytics URL regardless of
      // the first, so it could not fail even on a stale page.
      await expect(authenticatedPage).toHaveURL(/\/~\/analytics\/overview/);
      await analyticsPage.waitForPageLoad();
      await expect(
        analyticsPage.sectionHeading('Organization Analytics'),
      ).toBeVisible();
      const orgMetrics = authenticatedPage.getByRole('region', {
        name: 'Organization metrics',
      });
      await expect(orgMetrics).toContainText('Total Posts');
      await expect(orgMetrics).toContainText('18');
      await expect(
        authenticatedPage
          .locator('main table tbody tr')
          .filter({ hasText: 'Brand 1' }),
      ).toHaveCount(1);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        new URL(authenticatedPage.url()).pathname,
      );
      // A URL-pattern check alone would still pass on an "Organization
      // unavailable" fallback (its suggested link also contains "trends" in
      // the path), so also assert the real surface rendered and that no
      // ErrorBoundary fired. Each step waits for its own page to settle
      // (`waitForPageLoad`) before the next click, since these are
      // client-side transitions racing the analytics section's per-page
      // data fetches under parallel load.
      await analyticsPage.navigateToTrends();
      await expect(authenticatedPage).toHaveURL(/discovery\/trends/);
      await analyticsPage.waitForPageLoad();
      await expect(
        analyticsPage.sectionHeading('Social Media Trends'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        brandPath(APP_ROUTES.DISCOVERY.TRENDS),
      );
    });

    test('should display trends page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.DISCOVERY.TRENDS);

      await analyticsPage.gotoSection('trends');

      await expect(authenticatedPage).toHaveURL(/trends/);
      await expect(
        analyticsPage.sectionHeading('Social Media Trends'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should display hooks page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath('/analytics/hooks');

      await analyticsPage.gotoSection('hooks');

      await expect(authenticatedPage).toHaveURL(/hooks/);
      await expect(analyticsPage.sectionHeading('Viral Hooks')).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should display insights page', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath('/analytics/insights');

      await analyticsPage.gotoSection('insights');

      await expect(authenticatedPage).toHaveURL(/insights/);
      await expect(
        analyticsPage.sectionHeading('Social intelligence inbox'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });
  });

  test.describe('Filters', () => {
    test('should filter by date range', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const kpiRequests = await mockOverviewData(authenticatedPage);

      await authenticatedPage.goto(OVERVIEW_ROUTE);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, OVERVIEW_ROUTE);

      // The layout's `FormDateRangePicker` defaults to the last 7 days and
      // mirrors the range into the URL.
      await expect(authenticatedPage).toHaveURL(/startDate=.+&endDate=/);
      const initialRange = dateParams(authenticatedPage.url());
      expect(daysBetween(initialRange.startDate, initialRange.endDate)).toBe(6);

      await analyticsPage.selectDateRangePreset(30);

      await expect
        .poll(() => dateParams(authenticatedPage.url()).startDate)
        .not.toBe(initialRange.startDate);
      const nextRange = dateParams(authenticatedPage.url());
      expect(nextRange.endDate).toBe(initialRange.endDate);
      expect(daysBetween(nextRange.startDate, nextRange.endDate)).toBe(29);

      // The KPIs are re-requested for the new range.
      await expect
        .poll(() =>
          kpiRequests.some(
            (url) => dateParams(url).startDate === nextRange.startDate,
          ),
        )
        .toBe(true);
      await assertNoErrorBoundaryFallback(authenticatedPage, OVERVIEW_ROUTE);
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
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.TRENDS);

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    await assertNoErrorBoundaryFallback(
      unauthenticatedPage,
      APP_ROUTES.DISCOVERY.TRENDS,
    );
  });
});
