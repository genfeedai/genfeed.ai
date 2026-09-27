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

      await analyticsPage.gotoSection('insights');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // Insights is a generated feed (`InsightListCard`), not charts or metric
      // cards — the page was redesigned around AI-generated recommendations.
      await expect(analyticsPage.insightsListCard).toBeVisible();
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

    test('should show hook performance data or empty state', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.HOOKS);

      await analyticsPage.gotoSection('hooks');
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // The video hook breakdown is a `Table` (`@ui/display/table/Table`):
      // either rows render, or the table's own `table-empty` state does —
      // duplicates are expected across rows, hence `.first()`.
      await expect(
        authenticatedPage
          .locator('table tbody tr, [data-testid="table-empty"]')
          .first(),
      ).toBeVisible();
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

    test('should show post-level data or empty state', async ({
      authenticatedPage,
    }) => {
      const analyticsPage = new AnalyticsPage(authenticatedPage);
      const route = brandPath(APP_ROUTES.ANALYTICS.POSTS);

      await authenticatedPage.goto(route);
      await analyticsPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      // `AnalyticsPostsList` renders its posts in a `Table`: either rows or
      // the table's own `table-empty` state — duplicates are expected across
      // rows, hence `.first()`.
      await expect(
        authenticatedPage
          .locator('table tbody tr, [data-testid="table-empty"]')
          .first(),
      ).toBeVisible();
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
