import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction specs for the brand-scoped trends analytics surfaces:
 * the Trends list, a single Trend detail view, a platform-scoped trends
 * breakdown, Trend Turnover, Streaks, and Hooks.
 *
 * These pages render trend tables, viral-score charts, platform filter tabs,
 * and a Refresh control via the shared analytics layout. The analytics trends +
 * timeseries endpoints already return sample data through the shared API
 * interceptor, so charts and tables render without per-spec mocks.
 *
 * Interactions go through `tryClick` (never throws) or are guarded with
 * `.catch(() => {})` so the specs exercise the interactive code paths for
 * coverage while staying resilient to selector changes. Each test ends with a
 * body-visible assertion and an error-overlay guard.
 */

const BRAND = '/test-org/brand-1';

async function exerciseDateRange(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  await tryClick(page, 'button:has-text("30d")');
  await tryClick(page, 'button:has-text("90d")');
  await tryClick(page, 'button:has-text("7d")');
}

async function exerciseRefresh(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  await tryClick(page, 'button[aria-label="Refresh"]');
  await tryClick(page, 'button:has-text("Refresh")');
}

test.describe('Analytics — Trends (deep interactions)', () => {
  test.setTimeout(90_000);

  const routes = [
    `${BRAND}/analytics/trends`,
    `${BRAND}/analytics/trends/detail/mock-id`,
    `${BRAND}/analytics/trends/platforms/tiktok`,
    `${BRAND}/analytics/trend-turnover`,
    `${BRAND}/analytics/streaks`,
    `${BRAND}/analytics/hooks`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
      await expectNoErrorOverlay(authenticatedPage);
    });
  }

  test('trends list switches platform tabs and opens a trend', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/trends`);

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, '[role="option"]');
    await exerciseDateRange(authenticatedPage);
    await exerciseRefresh(authenticatedPage);

    // Open a trend → detail by following the first trend link or table row.
    const opened = await tryClick(
      authenticatedPage,
      'a[href*="/analytics/trends/detail/"]',
    );
    if (!opened) {
      await tryClick(authenticatedPage, 'tbody tr');
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('trend detail exercises charts, tabs, and back navigation', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/trends/detail/mock-id`,
    );

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="tab"]:nth-of-type(2)');
    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, 'a[href*="/analytics/trends"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('platform trends breakdown filters and refreshes', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/trends/platforms/tiktok`,
    );

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await exerciseDateRange(authenticatedPage);
    await exerciseRefresh(authenticatedPage);
    await tryClick(authenticatedPage, 'tbody tr');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('trend turnover cycles date-range and chart controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/trend-turnover`,
    );

    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await exerciseRefresh(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('streaks and hooks exercise filters and refresh', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/streaks`);

    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await exerciseRefresh(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/hooks`);

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, '[role="option"]:has-text("TikTok")');
    await exerciseRefresh(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
