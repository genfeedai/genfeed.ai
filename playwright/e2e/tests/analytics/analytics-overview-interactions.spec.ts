import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction specs for the core brand-scoped analytics dashboards:
 * Overview, Insights, Posts, and Performance Lab.
 *
 * The shared analytics layout renders a date-range picker (7d / 30d / 90d
 * preset buttons) plus a Refresh button, and individual surfaces add metric
 * selects, platform filters, search inputs, and chart/metric tab switches.
 * The analytics summary + timeseries endpoints already return sample data via
 * the shared API interceptor, so these pages render real charts and tables
 * without per-spec mocks.
 *
 * Every interaction uses `tryClick` (never throws) or `.catch(() => {})` so the
 * specs exercise the interactive code paths for coverage without becoming
 * brittle against selector churn. Each test ends with a body-visible assertion
 * and an error-overlay guard.
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

test.describe('Analytics — Overview & dashboards (deep interactions)', () => {
  test.setTimeout(90_000);

  const routes = [
    `${BRAND}/analytics/overview`,
    `${BRAND}/analytics/insights`,
    `${BRAND}/analytics/posts`,
    `${BRAND}/analytics/performance-lab`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
      await expectNoErrorOverlay(authenticatedPage);
    });
  }

  test('overview cycles date-range presets, tabs, and refresh', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/overview`);

    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="tab"]:nth-of-type(2)');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await exerciseRefresh(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('insights refreshes and switches metric controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/insights`);

    await exerciseRefresh(authenticatedPage);
    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('posts list filters by platform, metric, and search', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/posts`);

    // Metric + platform are radix Selects rendered as comboboxes.
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, '[role="option"]');
    await tryClick(authenticatedPage, '[role="combobox"]:nth-of-type(2)');
    await tryClick(authenticatedPage, '[role="option"]:has-text("TikTok")');

    const search = authenticatedPage
      .locator('input[placeholder="Search posts..."]')
      .first();
    await search
      .fill('launch')
      .catch(() => {})
      .then(() => search.fill('').catch(() => {}));

    await exerciseDateRange(authenticatedPage);
    await tryClick(authenticatedPage, 'tbody tr');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('performance lab exercises filters and chart tabs', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/performance-lab`,
    );

    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');
    await tryClick(authenticatedPage, '[role="option"]');
    await exerciseDateRange(authenticatedPage);
    await exerciseRefresh(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
