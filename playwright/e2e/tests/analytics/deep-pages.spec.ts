import {
  fromPrismaCredentialPlatform,
  InsightCategory,
  InsightImpact,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IInsightResponse,
  IViralHooksResult,
} from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';
import { brandPath } from '../../utils/app-chrome';
import { filtersTrigger } from '../../utils/filter-menu';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * Mock one API endpoint on the configured API (`playwrightApiEndpoint`) and
 * record every request it answers. `pathPattern` is a regular-expression
 * source for the path after the endpoint (e.g. `analytics/hooks\\?`), so a
 * mock never matches the page's own navigation request.
 */
async function mockApiRoute(
  page: Page,
  pathPattern: string,
  handler: (route: Route) => Promise<void>,
): Promise<string[]> {
  const seen: string[] = [];
  await page.route(
    createPlaywrightApiRoutePattern(pathPattern),
    async (route) => {
      seen.push(route.request().url());
      await handler(route);
    },
  );
  return seen;
}

function jsonApi(body: unknown): {
  body: string;
  contentType: string;
  status: number;
} {
  return {
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  };
}

/**
 * `GET /analytics/hooks` exactly as `AnalyticsResponseProjection
 * .buildViralHooks` produces it (`AnalyticsHooksSerializer`): a text hook per
 * post, string platform ids, and view/engagement aggregates
 * (genfeedai/genfeed.ai#5415).
 */
function viralHooksDocument(result: IViralHooksResult): unknown {
  return {
    data: {
      attributes: result,
      id: 'analytics-hooks',
      type: 'analytics-hooks',
    },
  };
}

const LAUNCH_HOOK = 'Stop scrolling: we shipped in 30 seconds';

/**
 * One post's `post_analytics` totals per platform — the rows both hooks
 * queries aggregate. The response below is derived from them, so the post's
 * platforms, its totals and `topPlatforms` always agree.
 */
const LAUNCH_POST_PLATFORM_ROWS = [
  { platform: 'tiktok', totalEngagement: 700, totalViews: 9000 },
  { platform: 'instagram', totalEngagement: 187, totalViews: 3000 },
];

const launchEngagement = LAUNCH_POST_PLATFORM_ROWS.reduce(
  (sum, row) => sum + row.totalEngagement,
  0,
);
const launchViews = LAUNCH_POST_PLATFORM_ROWS.reduce(
  (sum, row) => sum + row.totalViews,
  0,
);

const POPULATED_HOOKS: IViralHooksResult = {
  analysis: {
    hookEffectiveness: [
      {
        avgEngagement: launchEngagement,
        avgViews: launchViews,
        hook: LAUNCH_HOOK.toLowerCase(),
        postCount: 1,
      },
    ],
    topHooks: [
      {
        avgEngagement: launchEngagement,
        hook: LAUNCH_HOOK.toLowerCase(),
        postCount: 1,
      },
    ],
    // Every platform with data for the post set, ordered by engagement.
    topPlatforms: LAUNCH_POST_PLATFORM_ROWS.map((row) => ({
      platform: row.platform,
      postCount: 1,
      totalEngagement: row.totalEngagement,
      totalViews: row.totalViews,
    })),
    totalVideos: 1,
  },
  videos: [
    {
      description: `${LAUNCH_HOOK}\nFull recap of launch day inside.`,
      hook: LAUNCH_HOOK,
      id: 'post-1',
      platforms: LAUNCH_POST_PLATFORM_ROWS.map((row) => row.platform),
      title: 'Launch day recap',
      totalEngagement: launchEngagement,
      totalViews: launchViews,
    },
  ],
};

const EMPTY_HOOKS: IViralHooksResult = {
  analysis: {
    hookEffectiveness: [],
    topHooks: [],
    topPlatforms: [],
    totalVideos: 0,
  },
  videos: [],
};

// `GET /insights` (`InsightSerializer`, type `insight`) over
// `IInsightResponse` rows.
const EVENING_INSIGHT: Omit<IInsightResponse, 'createdAt' | 'id'> & {
  createdAt: string;
} = {
  actionableSteps: ['Post at 6pm local time'],
  category: InsightCategory.TREND,
  confidence: 82,
  createdAt: '2026-09-20T00:00:00.000Z',
  description: 'Evening posts outperform morning posts 2:1.',
  impact: InsightImpact.HIGH,
  isDismissed: false,
  isRead: false,
  relatedMetrics: ['engagementRate'],
  title: 'Evening posting window is outperforming',
};

/**
 * `post_analytics` rows behind `GET /analytics/top`, keyed by the stored
 * Prisma platform label. `topPostsDocument` mirrors the endpoint
 * (`AnalyticsService.getTopContent` + `buildTopContent`): it converts the
 * `platform` query to the Prisma label before filtering, emits domain
 * platform ids, and always sets `isVideo: false`.
 */
const TOP_POST_ROWS = [
  {
    brandLogo: null,
    brandName: 'Brand 1',
    description: 'Launch day recap',
    engagementRate: 7.4,
    ingredientUrl: null,
    isVideo: false,
    label: 'Launch day recap',
    platform: 'TIKTOK',
    postId: 'post-1',
    thumbnailUrl: null,
    totalComments: 45,
    totalEngagement: 887,
    totalLikes: 800,
    totalSaves: 12,
    totalShares: 30,
    totalViews: 12000,
  },
  {
    brandLogo: null,
    brandName: 'Brand 1',
    description: 'Behind the scenes',
    engagementRate: 5.1,
    ingredientUrl: null,
    isVideo: false,
    label: 'Behind the scenes',
    platform: 'INSTAGRAM',
    postId: 'post-2',
    thumbnailUrl: null,
    totalComments: 20,
    totalEngagement: 410,
    totalLikes: 370,
    totalSaves: 5,
    totalShares: 15,
    totalViews: 8000,
  },
];

function topPostsDocument(requestUrl: string): unknown {
  const requested = new URL(requestUrl).searchParams.get('platform');
  const label = requested ? toPrismaCredentialPlatform(requested) : undefined;
  return {
    data: TOP_POST_ROWS.filter(
      (row) => !requested || row.platform === label,
    ).map((row) => ({
      attributes: {
        ...row,
        platform: fromPrismaCredentialPlatform(row.platform) ?? row.platform,
      },
      id: `top-${row.postId}`,
      type: 'analytics-top-post',
    })),
  };
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
      // The shell breadcrumb is the only page title: the feed card and the
      // inbox carry no heading of their own, and an empty inbox renders
      // nothing so the page's empty state speaks once.
      await expect(analyticsPage.breadcrumbLeaf('Insights')).toBeVisible();
      await expect(analyticsPage.insightsListCard).toBeVisible();
      await expect(
        authenticatedPage.getByRole('region', {
          name: 'Social intelligence inbox',
        }),
      ).toHaveCount(1);
      await expect(analyticsPage.sectionHeading('AI Insights')).toHaveCount(0);
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show the AI insights feed', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.INSIGHTS);

      // `GET /insights` isn't under `/analytics`, so the generic
      // `/analytics/**` fixture doesn't cover it — mock it explicitly with
      // deterministic content.
      const seen = await mockApiRoute(
        authenticatedPage,
        'insights/?\\?',
        async (r) => {
          await r.fulfill(
            jsonApi({
              data: [
                {
                  attributes: EVENING_INSIGHT,
                  id: 'insight-1',
                  type: 'insight',
                },
              ],
            }),
          );
        },
      );

      await analyticsPage.gotoSection('insights');
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
      expect(seen.length).toBeGreaterThan(0);
    });

    test('should show the empty state when there are no insights', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.INSIGHTS);

      // A valid, empty collection — the real "no insights yet" contract,
      // not the "unavailable" error state.
      const seen = await mockApiRoute(
        authenticatedPage,
        'insights/?\\?',
        async (r) => {
          await r.fulfill(
            jsonApi({ data: [], meta: { page: 1, pageSize: 15, total: 0 } }),
          );
        },
      );

      await analyticsPage.gotoSection('insights');
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(analyticsPage.insightsListCard).toBeVisible();
      await expect(analyticsPage.insightsListCard).toContainText(
        'No insights yet',
      );
      await expect(
        authenticatedPage.getByText('Analytics insights unavailable'),
      ).toHaveCount(0);
      expect(seen.length).toBeGreaterThan(0);
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
      await expect(analyticsPage.breadcrumbLeaf('Hooks')).toBeVisible();
      await expect(
        analyticsPage.sectionHeading('Post hook breakdown'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show real hook performance data', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);
      const main = authenticatedPage.locator('main');

      const seen = await mockApiRoute(
        authenticatedPage,
        'analytics/hooks\\?',
        async (r) => {
          await r.fulfill(jsonApi(viralHooksDocument(POPULATED_HOOKS)));
        },
      );

      await analyticsPage.gotoSection('hooks');
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // Post table: the post, its text hook, platforms and aggregates.
      const rows = main.locator('table tbody tr');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText('Launch day recap');
      await expect(rows).toContainText(LAUNCH_HOOK);
      // The platform badges are icon-only with a screen-reader label.
      await expect(rows.getByText('TikTok', { exact: true })).toHaveCount(1);
      await expect(rows.getByText('Instagram', { exact: true })).toHaveCount(1);
      await expect(rows).toContainText('12.0k');
      await expect(rows).toContainText('887');

      // Both platforms the post ran on have a card with their own totals.
      const tiktokCard = main.getByTestId('hook-platform-tiktok');
      await expect(tiktokCard).toContainText('9.0k');
      await expect(tiktokCard).toContainText('700');
      const instagramCard = main.getByTestId('hook-platform-instagram');
      await expect(instagramCard).toContainText('3.0k');
      await expect(instagramCard).toContainText('187');
      await expect(tiktokCard).not.toContainText('No data available');
      await expect(instagramCard).not.toContainText('No data available');

      // Stat cards and rankings come from `analysis`.
      const statCard = (label: string) =>
        main.getByTestId('metric-card').filter({ hasText: label });
      await expect(statCard('Posts Analyzed')).toContainText('1');
      await expect(statCard('Hook Patterns')).toContainText('1');
      await expect(statCard('Best Hook Avg Engagement')).toContainText('887');
      await expect(statCard('Top Platform')).toContainText('TIKTOK');
      await expect(
        main.getByText(LAUNCH_HOOK.toLowerCase(), { exact: true }),
      ).toHaveCount(2);
      await expect(
        main.getByText('887 avg engagement • 1 posts', { exact: true }),
      ).toBeVisible();

      await expect(main.getByTestId('table-empty')).toHaveCount(0);
      expect(seen.length).toBeGreaterThan(0);
    });

    test('should show the empty state when there is no hook data', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);
      const main = authenticatedPage.locator('main');

      // A valid, empty response — the real "no data yet" contract, not the
      // malformed generic fallback.
      const seen = await mockApiRoute(
        authenticatedPage,
        'analytics/hooks\\?',
        async (r) => {
          await r.fulfill(jsonApi(viralHooksDocument(EMPTY_HOOKS)));
        },
      );

      await analyticsPage.gotoSection('hooks');
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(main.getByTestId('table-empty')).toBeVisible();
      await expect(main.locator('table tbody tr')).toHaveCount(0);
      await expect(
        main.getByTestId('metric-card').filter({ hasText: 'Posts Analyzed' }),
      ).toContainText('0');
      await expect(
        main.getByText('No top hook patterns detected yet.'),
      ).toBeVisible();
      await expect(main.getByText('No hook reach data yet.')).toBeVisible();
      expect(seen.length).toBeGreaterThan(0);
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
      // The breadcrumb is the page title; the page publishes its filters into
      // the subbar, so an empty shell still fails.
      await expect(
        analyticsPage.breadcrumbLeaf('Performance Lab'),
      ).toBeVisible();
      await expect(analyticsPage.filtersButton).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show the pattern grid empty state when there are no patterns', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.PERFORMANCE_LAB);

      // `GET /creative-patterns` — a valid, empty collection.
      const seen = await mockApiRoute(
        authenticatedPage,
        'creative-patterns\\?',
        async (r) => {
          await r.fulfill(jsonApi({ data: [], meta: { totalCount: 0 } }));
        },
      );

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(
        analyticsPage.sectionHeading('No patterns found'),
      ).toBeVisible();
      // An empty collection is the empty state, not the load-error alert.
      await expect(
        authenticatedPage.getByText('Failed to load patterns'),
      ).toHaveCount(0);
      expect(seen.length).toBeGreaterThan(0);
    });
  });

  test.describe('Trend Turnover Page', () => {
    test('should display trend turnover page', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.DISCOVERY.TREND_TURNOVER);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/trend-turnover/);
      await expect(
        analyticsPage.sectionHeading('Trend Turnover'),
      ).toBeVisible();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);
    });

    test('should show trend analysis content', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.DISCOVERY.TREND_TURNOVER);
      const main = authenticatedPage.locator('main');

      // `GET /trends/turnover` (`TrendsService.getTurnoverStats`,
      // `TrendTurnoverResponse`).
      const seen = await mockApiRoute(
        authenticatedPage,
        'trends/turnover\\?',
        async (r) => {
          await r.fulfill(
            jsonApi({
              byPlatform: [
                {
                  alive: 3,
                  appeared: 6,
                  avgLifespanDays: 4.5,
                  died: 3,
                  platform: 'instagram',
                  turnoverRate: 50,
                },
              ],
              days: 30,
              timeline: [
                { appeared: 2, date: '2026-09-21', died: 1 },
                { appeared: 4, date: '2026-09-22', died: 2 },
              ],
              totals: {
                alive: 3,
                appeared: 6,
                avgLifespanDays: 4.5,
                died: 3,
                turnoverRate: 50,
              },
            }),
          );
        },
      );

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      const rows = main.locator('table tbody tr');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText('Instagram');
      await expect(rows).toContainText('4.5d');
      await expect(rows).toContainText('50%');
      await expect(
        main.getByTestId('metric-card').filter({ hasText: 'Appeared' }),
      ).toContainText('6');
      await expect(
        main.getByTestId('metric-card').filter({ hasText: 'Died' }),
      ).toContainText('3');
      await expect(
        main.getByTestId('metric-card').filter({ hasText: 'Turnover Rate' }),
      ).toContainText('50%');
      expect(seen.length).toBeGreaterThan(0);
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
      await expect(analyticsPage.breadcrumbLeaf('Posts')).toBeVisible();
      await expect(analyticsPage.postCards).toHaveCount(2);
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

      const search = authenticatedPage.getByPlaceholder('Search posts...');
      await expect(search).toBeVisible();
      // The Filters menu sits inside the search field, not beside it.
      await expect(filtersTrigger(search.locator('xpath=../..'))).toBeVisible();
      // Platform lives in the shared Filters menu in the subbar; with no
      // filter applied its summary reads "All".
      await analyticsPage.filtersButton.click();
      await expect(
        authenticatedPage.getByRole('menuitem', { name: /^Platform/ }),
      ).toContainText('All');
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
      // Posts render as a paginated card grid with compact counts.
      const cards = analyticsPage.postCards;
      await expect(cards).toHaveCount(2);

      const firstCard = cards.filter({ hasText: 'Launch day recap' });
      await expect(firstCard).toContainText('Brand 1');
      await expect(firstCard).toContainText('TikTok');
      await expect(firstCard).toContainText('12.0k');
      await expect(firstCard).toContainText('887');
      await expect(firstCard).toContainText('7.40%');

      const secondCard = cards.filter({ hasText: 'Behind the scenes' });
      await expect(secondCard).toContainText('8.0k');

      await expect(
        authenticatedPage.getByTestId('empty-state-card'),
      ).toHaveCount(0);
    });

    test('should filter posts by platform', async ({ authenticatedPage }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      const seen = await mockApiRoute(
        authenticatedPage,
        'analytics/top\\?',
        async (r) => {
          await r.fulfill(jsonApi(topPostsDocument(r.request().url())));
        },
      );

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      const cards = analyticsPage.postCards;
      await expect(cards).toHaveCount(2);

      await analyticsPage.selectFilter('Platform', 'Instagram');

      await expect
        .poll(() =>
          seen.some(
            (url) => new URL(url).searchParams.get('platform') === 'instagram',
          ),
        )
        .toBe(true);
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText('Behind the scenes');
      await expect(cards).toContainText('Instagram');
      // The menu reports the applied filter: a count badge on the trigger and
      // the chosen option in the facet's summary.
      await expect(analyticsPage.filtersButton).toContainText(
        '1 active filter',
      );
      await analyticsPage.filtersButton.click();
      await expect(
        authenticatedPage.getByRole('menuitem', { name: /^Platform/ }),
      ).toContainText('Instagram');
    });

    test('should show the empty state when there are no posts', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      // Override the seeded posts with a valid, empty JSON:API collection —
      // the real "no data yet" contract, not a malformed fallback.
      const seen = await mockApiRoute(
        authenticatedPage,
        'analytics/top\\?',
        async (r) => {
          await r.fulfill(jsonApi({ data: [] }));
        },
      );

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      await expect(
        authenticatedPage.getByTestId('empty-state-card'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('No posts found for this period'),
      ).toBeVisible();
      await expect(analyticsPage.postCards).toHaveCount(0);
      expect(seen.length).toBeGreaterThan(0);
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
    await assertNoErrorBoundaryFallback(
      unauthenticatedPage,
      APP_ROUTES.ANALYTICS.INSIGHTS,
    );
  });

  test('should redirect unauthenticated user from performance lab', async ({
    unauthenticatedPage,
  }) => {
    const route = brandPath(APP_ROUTES.ANALYTICS.PERFORMANCE_LAB);
    await unauthenticatedPage.goto(route);

    // Should redirect to login
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    await assertNoErrorBoundaryFallback(unauthenticatedPage, route);
  });
});
