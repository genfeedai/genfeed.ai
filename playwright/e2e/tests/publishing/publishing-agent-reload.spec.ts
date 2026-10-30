import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/publishing';

/** Counts the GET list reads the page makes against one collection. */
function countListReads(page: Page, collection: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.endsWith(`/${collection}`)
    ) {
      count += 1;
    }
  });
  return () => count;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    /* a socket or poll can keep the network busy; the count is still stable */
  });
}

test.describe('Publishing reloads when the agent changes posts', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  });

  test('reloads the queue when the agent changes posts', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockPostsList(page, []);
    const postReads = countListReads(page, 'posts');
    await page.goto(`${base}/posts`);
    await assertNoErrorBoundaryFallback(page);
    await expect.poll(postReads).toBeGreaterThan(0);
    await settle(page);

    const before = postReads();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('publishing:content-refresh'));
    });

    await expect.poll(postReads).toBeGreaterThan(before);
  });

  test('reloads the calendar when the agent changes posts', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const releaseReads = countListReads(page, 'post-groups');
    await page.goto(`${base}/calendar`);
    await assertNoErrorBoundaryFallback(page);
    await expect.poll(releaseReads).toBeGreaterThan(0);
    await settle(page);

    const before = releaseReads();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('publishing:content-refresh'));
    });

    await expect.poll(releaseReads).toBeGreaterThan(before);
  });
});
