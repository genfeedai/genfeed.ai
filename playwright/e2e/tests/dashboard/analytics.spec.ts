import type { Locator, Page, Route } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
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
 *
 * The metric grid reads `GET /auth/bootstrap/overview`
 * (`useOverviewBootstrap`); `mockAnalyticsData` seeds it with
 * `reviewInbox.readyCount: 2` and `analytics.pendingPosts: 3`. The activity
 * feed reads `GET /activities` (`useActivities`), seeded with three
 * activities. All API calls are mocked - no real backend requests occur.
 */

const BOOTSTRAP_OVERVIEW = createPlaywrightApiRoutePattern(
  'auth/bootstrap/overview',
);
const ACTIVITIES = createPlaywrightApiRoutePattern('activities\\?');

function metricCard(dashboardPage: DashboardPage, label: string): Locator {
  return dashboardPage.statsSection
    .getByTestId('metric-card')
    .filter({ hasText: label });
}

async function expectSeededMetrics(
  dashboardPage: DashboardPage,
): Promise<void> {
  await expect(dashboardPage.statsSection).toBeVisible();
  const ready = metricCard(dashboardPage, 'Ready to review');
  const pending = metricCard(dashboardPage, 'Pending posts');
  await expect(ready).not.toHaveAttribute('aria-busy', 'true');
  await expect(ready).toContainText('2');
  await expect(pending).not.toHaveAttribute('aria-busy', 'true');
  await expect(pending).toContainText('3');
}

/** Registers `handler` for `pattern` and records every request it sees. */
async function interceptApi(
  page: Page,
  pattern: RegExp,
  handler: (route: Route) => Promise<void>,
): Promise<string[]> {
  const seen: string[] = [];
  await page.route(pattern, async (route) => {
    seen.push(route.request().url());
    await handler(route);
  });
  return seen;
}

test.describe('Dashboard Analytics', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Statistics Widgets', () => {
    test('should display the operational metrics from the overview bootstrap', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(authenticatedPage).toHaveURL(/overview/);
      await expectSeededMetrics(dashboardPage);
    });
  });

  test.describe('Activity Feed', () => {
    test('should display activity section', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(dashboardPage.activitySection).toBeVisible();
      await expect(dashboardPage.activitySection).toContainText(
        'Recent activity',
      );
    });

    test('should display activity items', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(dashboardPage.activityItem).toHaveCount(3);
      await expect(dashboardPage.activityItem.nth(0)).toContainText(
        'Generated a video',
      );
      await expect(dashboardPage.activityItem.nth(1)).toContainText(
        'Generated an image',
      );
      await expect(dashboardPage.activityItem.nth(2)).toContainText(
        'Subscription credits',
      );
    });

    test('should show activity timestamps', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      // Every seeded activity has a fixed past `createdAt`, rendered by
      // `ClientFormattedDate` as a relative time — not its "Time
      // unavailable" fallback.
      await expect(dashboardPage.activityItem).toHaveCount(3);
      for (const row of await dashboardPage.activityItem.all()) {
        await expect(row).toContainText(
          /\d+ (minute|hour|day|month|year)s? ago/,
        );
      }
      await expect(dashboardPage.activitySection).not.toContainText(
        'Time unavailable',
      );
    });

    test('should handle empty activity state', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      const seen = await interceptApi(
        authenticatedPage,
        ACTIVITIES,
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              data: [],
              meta: { page: 1, pageSize: 5, totalCount: 0 },
            }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(
        dashboardPage.activitySection.getByTestId('workspace-empty-state'),
      ).toHaveText('No recent activity yet.');
      await expect(dashboardPage.activityItem).toHaveCount(0);
      expect(seen.length).toBeGreaterThan(0);
    });
  });

  test.describe('Loading States', () => {
    test('should show loading state while fetching data', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Hold the bootstrap request until the loading UI has been observed,
      // then hand it back to `mockAnalyticsData`'s handler.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const seen = await interceptApi(
        authenticatedPage,
        BOOTSTRAP_OVERVIEW,
        async (route) => {
          await gate;
          await route.fallback();
        },
      );

      await authenticatedPage.goto(dashboardPage.url);

      const ready = metricCard(dashboardPage, 'Ready to review');
      await expect(ready).toHaveAttribute('aria-busy', 'true');
      await expect.poll(() => seen.length).toBeGreaterThan(0);

      release();

      await expectSeededMetrics(dashboardPage);
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);
    });

    test('should handle slow network gracefully', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      // Delay every API call, then `route.fallback()` (not `.continue()`)
      // so the request still reaches the earlier-registered mocks —
      // `.continue()` would hit the real, non-existent backend.
      const seen = await interceptApi(
        authenticatedPage,
        createPlaywrightApiRoutePattern(),
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await route.fallback();
        },
      );

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expectSeededMetrics(dashboardPage);
      await expect(dashboardPage.activityItem).toHaveCount(3);
      expect(seen.some((url) => BOOTSTRAP_OVERVIEW.test(url))).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle overview bootstrap API error', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      const seen = await interceptApi(
        authenticatedPage,
        BOOTSTRAP_OVERVIEW,
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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      // The attention queue degrades to its inline error line instead of
      // crashing the page; the other surfaces stay available.
      await expect(
        authenticatedPage
          .getByTestId('operational-home-needs-you')
          .getByRole('alert'),
      ).toContainText('Approval state is temporarily unavailable.');
      await expect(dashboardPage.activityItem).toHaveCount(3);
      expect(seen.length).toBeGreaterThan(0);
    });

    test('should handle activities API error', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      const seen = await interceptApi(
        authenticatedPage,
        ACTIVITIES,
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
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect(
        dashboardPage.activitySection.getByRole('alert'),
      ).toContainText('Recent activity is temporarily unavailable.');
      await expect(dashboardPage.activityItem).toHaveCount(0);
      await expectSeededMetrics(dashboardPage);
      expect(seen.length).toBeGreaterThan(0);
    });
  });

  test.describe('Data Refresh', () => {
    test('should refresh data on page reload', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);
      const seen = await interceptApi(
        authenticatedPage,
        BOOTSTRAP_OVERVIEW,
        async (route) => {
          await route.fallback();
        },
      );

      await dashboardPage.goto();
      await expectSeededMetrics(dashboardPage);
      const requestsBeforeReload = seen.length;
      expect(requestsBeforeReload).toBeGreaterThan(0);

      await authenticatedPage.reload();
      await dashboardPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expect
        .poll(() => seen.length)
        .toBeGreaterThan(requestsBeforeReload);
      await expectSeededMetrics(dashboardPage);
    });
  });

  test.describe('Responsive Analytics', () => {
    test('should display analytics on mobile viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expectSeededMetrics(dashboardPage);
      await expect(dashboardPage.activitySection).toBeVisible();
    });

    test('should display analytics on tablet viewport', async ({
      authenticatedPage,
    }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await dashboardPage.goto();
      await assertNoErrorBoundaryFallback(authenticatedPage, dashboardPage.url);

      await expectSeededMetrics(dashboardPage);
      await expect(dashboardPage.activitySection).toBeVisible();
    });
  });
});
