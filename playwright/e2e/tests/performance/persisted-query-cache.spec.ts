import type { Page } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';

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
