import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * Scope a mock to the API host, not just a path substring — an unscoped
 * `page.route('**\/insights**', ...)` also matches the *page's own*
 * navigation request (e.g. `/test-org/brand-1/analytics/insights` contains
 * "insights" too), which replaces the whole document with the mock's JSON
 * body instead of the app's HTML.
 */
async function mockApiRoute(
  page: Page,
  path: string,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route(`**/api.genfeed.ai${path}`, handler);
  await page.route(`**/api.genfeed.ai/v1${path}`, handler);
  await page.route(`${playwrightApiEndpoint}${path}`, handler);
}

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
      const route = brandPath(APP_ROUTES.ANALYTICS.INSIGHTS);

      await analyticsPage.gotoSection('insights');

      await expect(authenticatedPage).toHaveURL(/insights/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show the AI insights feed', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.INSIGHTS);

      // `GET /insights` (InsightsService.getInsights) is a JSON:API
      // collection of `IInsightResponse` — mock it explicitly with
      // deterministic content instead of accepting whatever the generic
      // `/analytics/**` fallback (a different endpoint entirely; this one
      // isn't under `/analytics`) happens to produce.
      await mockApiRoute(authenticatedPage, '/insights**', async (r) => {
        if (r.request().method() !== 'GET') {
          await r.fallback();
          return;
        }
        await r.fulfill({
          body: JSON.stringify({
            data: [
              {
                attributes: {
                  actionableSteps: ['Post at 6pm local time'],
                  category: 'trend',
                  confidence: 82,
                  createdAt: '2026-09-20T00:00:00.000Z',
                  description: 'Evening posts outperform morning posts 2:1.',
                  impact: 'high',
                  isDismissed: false,
                  isRead: false,
                  relatedMetrics: ['engagementRate'],
                  title: 'Evening posting window is outperforming',
                },
                id: 'insight-1',
                type: 'insights',
              },
            ],
          }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await analyticsPage.gotoSection('insights');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // Insights is a generated feed (`InsightListCard`), not charts or metric
      // cards — the page was redesigned around AI-generated recommendations.
      await expect(analyticsPage.insightsListCard).toBeVisible();
      await expect(analyticsPage.insightsListCard).toContainText(
        'Evening posting window is outperforming',
      );
      await expect(analyticsPage.insightsListCard).toContainText(
        'Evening posts outperform morning posts 2:1.',
      );
      await expect(
        authenticatedPage.getByText('Analytics insights unavailable'),
      ).toHaveCount(0);
    });

    test('should show the empty state when there are no insights', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.INSIGHTS);

      // A valid, empty collection — the real "no insights yet" contract,
      // not the "unavailable" error state.
      await mockApiRoute(authenticatedPage, '/insights**', async (r) => {
        if (r.request().method() !== 'GET') {
          await r.fallback();
          return;
        }
        await r.fulfill({
          body: JSON.stringify({ data: [] }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await analyticsPage.gotoSection('insights');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(analyticsPage.insightsListCard).toBeVisible();
      await expect(analyticsPage.insightsListCard).toContainText(
        'No insights yet',
      );
      await expect(
        authenticatedPage.getByText('Analytics insights unavailable'),
      ).toHaveCount(0);
    });
  });

  test.describe('Hooks Page', () => {
    test('should display hooks performance page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);

      await analyticsPage.gotoSection('hooks');

      await expect(authenticatedPage).toHaveURL(/hooks/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show real hook performance data', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);

      // `GET /analytics/hooks` (AnalyticsService.getViralHooks) is a single
      // resource shaped `{ videos: IViralHookVideo[], analysis:
      // IViralHookAnalysis }` (`AnalyticsHooksSerializer`'s `videos`/
      // `analysis` attributes) — the generic `/analytics/**` fallback used
      // elsewhere in this file doesn't match this shape, so mock it
      // explicitly rather than accepting whatever empty state the mismatch
      // produces.
      await mockApiRoute(authenticatedPage, '/analytics/hooks**', async (r) => {
        await r.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                analysis: {
                  avgTimePerVideo: 42,
                  hookEffectiveness: [
                    { avgEffectiveness: 78, count: 1, type: 'visual' },
                  ],
                  topHooks: ['Cold open reveal'],
                  topPlatforms: [
                    {
                      avgViralScore: 91,
                      platform: 'tiktok',
                      totalViews: 12000,
                    },
                  ],
                  totalTime: 42,
                  totalVideos: 1,
                },
                videos: [
                  {
                    analysisNotes: 'Strong cold open',
                    creator: 'Brand 1',
                    duration: 30,
                    hooks: [
                      {
                        description: 'Cold open reveal',
                        duration: 3,
                        effectiveness: 78,
                        timestamp: 0,
                        type: 'visual',
                      },
                    ],
                    id: 'video-1',
                    platforms: [
                      {
                        avgWatchTime: 18,
                        comments: 45,
                        completionRate: 0.6,
                        engagementRate: 7.4,
                        likes: 800,
                        platform: 'tiktok',
                        saves: 12,
                        shares: 30,
                        viralScore: 91,
                        views: 12000,
                      },
                    ],
                    title: 'Launch day recap',
                    totalTimeTracked: 42,
                    uploadDate: '2026-09-01T00:00:00.000Z',
                  },
                ],
              },
              id: 'analytics-hooks',
              type: 'analytics-hooks',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await analyticsPage.gotoSection('hooks');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      const rows = authenticatedPage.locator('table tbody tr');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText('Launch day recap');
      await expect(rows).toContainText('Brand 1');
      await expect(rows).toContainText('1 hooks');
      await expect(
        authenticatedPage.locator('[data-testid="table-empty"]'),
      ).toHaveCount(0);
    });

    test('should show the empty state when there is no hook data', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);

      // A valid, empty single-resource response — the real "no data yet"
      // contract, not the malformed generic fallback.
      await mockApiRoute(authenticatedPage, '/analytics/hooks**', async (r) => {
        await r.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                analysis: {
                  avgTimePerVideo: 0,
                  hookEffectiveness: [],
                  topHooks: [],
                  topPlatforms: [],
                  totalTime: 0,
                  totalVideos: 0,
                },
                videos: [],
              },
              id: 'analytics-hooks',
              type: 'analytics-hooks',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await analyticsPage.gotoSection('hooks');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(
        authenticatedPage.locator('[data-testid="table-empty"]'),
      ).toBeVisible();
      await expect(authenticatedPage.locator('table tbody tr')).toHaveCount(0);
    });
  });

  test.describe('Performance Lab Page', () => {
    test('should display performance lab page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.PERFORMANCE_LAB);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/performance-lab/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show the pattern grid or its empty state', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.PERFORMANCE_LAB);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // `PatternLabPage` (apps/app/packages/components/performance-lab) has no
      // pattern data under these mocks, so it renders its "No patterns found"
      // empty state — the only comparison UI it ships today.
      await expect(
        authenticatedPage.getByRole('heading', { name: /no patterns found/i }),
      ).toBeVisible();
    });
  });

  test.describe('Trend Turnover Page', () => {
    test('should display trend turnover page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.TREND_TURNOVER);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/trend-turnover/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show trend analysis content', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.TREND_TURNOVER);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // `buildUnhandledApiMockBody`'s `/turnover` fallback (api-interceptor.ts)
      // returns real per-platform stats, so the Platform Breakdown `Table`
      // renders a data row rather than its empty state.
      await expect(
        authenticatedPage.locator('table tbody tr').first(),
      ).toBeVisible();
    });
  });

  test.describe('Posts Analytics Page', () => {
    test('should display posts analytics page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/analytics\/posts/);
      await expect(analyticsPage.mainContent).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show analytics posts filters with the default platform selected', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(
        authenticatedPage.getByPlaceholder('Search posts...'),
      ).toBeVisible();

      const filters = authenticatedPage.getByRole('combobox');
      await expect(filters).toHaveCount(2);
      await expect(filters.nth(1)).toContainText('All');
    });

    test('should show the mocked posts and their metrics', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // `mockAnalyticsData` seeds two posts via `/analytics/top` (see
      // genfeedai/genfeed.ai#5404 for why the mock's field names matter).
      // Assert the real rendered rows, not just "a table or its empty
      // state" — that would also pass if the mock regressed to an empty
      // collection.
      const rows = authenticatedPage.locator('table tbody tr');
      await expect(rows).toHaveCount(2);

      const firstRow = rows.filter({ hasText: 'Launch day recap' });
      await expect(firstRow).toContainText('Brand 1');
      await expect(firstRow).toContainText('tiktok');
      await expect(firstRow).toContainText('12,000');
      await expect(firstRow).toContainText('887');
      await expect(firstRow).toContainText('7.40%');

      const secondRow = rows.filter({ hasText: 'Behind the scenes' });
      await expect(secondRow).toContainText('8,000');

      await expect(
        authenticatedPage.locator('[data-testid="table-empty"]'),
      ).toHaveCount(0);
    });

    test('should show the empty state when there are no posts', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      // Override the seeded posts with a valid, empty JSON:API collection —
      // the real "no data yet" contract, not a malformed fallback.
      await mockApiRoute(authenticatedPage, '/analytics/top**', async (r) => {
        await r.fulfill({
          body: JSON.stringify({ data: [] }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(
        authenticatedPage.locator('[data-testid="table-empty"]'),
      ).toBeVisible();
      await expect(authenticatedPage.locator('table tbody tr')).toHaveCount(0);
    });
  });
});

// A sibling top-level describe, deliberately outside `Analytics Deep Pages`:
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
test.describe('Analytics Deep Pages — Unauthenticated Access', () => {
  test('should redirect unauthenticated user from analytics deep pages', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.ANALYTICS.INSIGHTS);

    // Should redirect to login
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });

  test('should redirect unauthenticated user from performance lab', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(
      brandPath(APP_ROUTES.ANALYTICS.PERFORMANCE_LAB),
    );

    // Should redirect to login
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
