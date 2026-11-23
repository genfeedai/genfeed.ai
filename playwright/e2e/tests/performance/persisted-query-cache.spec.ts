import type { Page } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';
import {
  BLOCK_SHIFT_BUDGET_PX,
  holdRequests,
} from '../../utils/block-skeleton-helpers';

const BOOTSTRAP_OVERVIEW = createPlaywrightApiRoutePattern(
  'auth/bootstrap/overview',
);

/** Whether the device holds a saved copy of the query cache. */
async function hasStoredSnapshot(page: Page): Promise<boolean> {
  return await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('genfeed-query-cache', 1);
        open.onupgradeneeded = () => {
          open.transaction?.abort();
          resolve(false);
        };
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction('snapshots', 'readonly')
            .objectStore('snapshots')
            .get('current');
          request.onsuccess = () => {
            database.close();
            resolve(request.result !== undefined);
          };
          request.onerror = () => {
            database.close();
            resolve(false);
          };
        };
      }),
  );
}

/**
 * A reload used to rebuild the Overview from zero (epic #10926, #10928). The
 * query cache of the last visit is kept on the device, so the metrics come
 * back at once and the network only refreshes them.
 */
test.describe('Workspace overview — cache kept across a reload', () => {
  test.setTimeout(90_000);

  test('shows the last metrics while the overview request is still pending', async ({
    authenticatedPage: page,
  }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    const ready = dashboardPage.statsSection
      .getByTestId('metric-card')
      .filter({ hasText: 'Ready to review' });
    await expect(ready).toContainText('2');
    await expect.poll(() => hasStoredSnapshot(page)).toBe(true);

    let releaseRequest: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route(BOOTSTRAP_OVERVIEW, async (route) => {
      await held;
      await route.fallback();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(ready).toContainText('2');
    await expect(ready).not.toHaveAttribute('aria-busy', 'true');
    releaseRequest();
  });
});

/**
 * The Home connection line grew in after its read answered and pushed the
 * sections down about 58 px (epic #10926). It is remembered per organization,
 * so a reload paints it at once and the sections do not move.
 */
test.describe('Workspace overview — connection line remembered', () => {
  test.setTimeout(90_000);

  test('keeps the sections where they are while the connection read is pending', async ({
    authenticatedPage: page,
  }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    const line = page.getByTestId('operational-home-unconfigured');
    await expect(line).toBeVisible();
    const sections = page.getByTestId('operational-home-sections');
    await expect(sections).toBeVisible();
    await expect(line).toBeVisible();
    const settled = await sections.boundingBox();

    const held = await holdRequests(page, (url) =>
      url.pathname.includes('/api-keys'),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    await expect(line).toBeVisible();
    const painted = await sections.boundingBox();
    expect(painted).not.toBeNull();
    expect(Math.abs((painted?.y ?? 0) - (settled?.y ?? 0))).toBeLessThanOrEqual(
      BLOCK_SHIFT_BUDGET_PX,
    );
    held.release();
  });
});
