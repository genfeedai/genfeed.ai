import {
  mockEmptyBrands,
  mockEmptyContentLibrary,
  mockEmptyLibrary,
  mockServerError,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Empty-state coverage for the authenticated app surfaces.
 *
 * Each test forces a resource collection to return zero items (via the empty-*
 * mocks, or a 200 with an empty JSON:API collection) AFTER the authenticatedPage
 * fixture has bootstrapped, then navigates to the route. The app must render the
 * empty / zero-data branch without throwing, showing a body and no Next.js error
 * overlay, and without redirecting to /login.
 *
 * These hit code paths that happy-path (populated) tests never reach.
 */

const ORG_BRAND = '/test-org/brand-1';

type Page = Parameters<typeof mockEmptyContentLibrary>[0];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(400);
}

async function assertHealthy(page: Page, route: string): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
  expect(page.url(), `${route} redirected to login`).not.toMatch(/\/login/);
}

/** Fulfill a GET collection with an empty JSON:API payload; pass through writes. */
async function mockEmptyCollection(
  page: Page,
  urlPattern: string,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('App surfaces — empty data states', () => {
  test.setTimeout(90_000);

  test('empty image library renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyContentLibrary(authenticatedPage, 'images');
    const route = `${ORG_BRAND}/library/images`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty video library renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyContentLibrary(authenticatedPage, 'videos');
    const route = `${ORG_BRAND}/library/videos`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty music library renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyContentLibrary(authenticatedPage, 'musics');
    const route = `${ORG_BRAND}/library/music`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('library landing handles no brands', async ({ authenticatedPage }) => {
    await mockEmptyBrands(authenticatedPage);
    const route = `${ORG_BRAND}/library`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('marketplace purchases library handles an empty list', async ({
    authenticatedPage,
  }) => {
    await mockEmptyLibrary(authenticatedPage);
    const route = `${ORG_BRAND}/library/ingredients`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty posts list renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/posts**');
    const route = `${ORG_BRAND}/posts`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty scheduled posts filter renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/posts**');
    const route = `${ORG_BRAND}/posts?status=scheduled`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty review queue renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/posts**');
    const route = `${ORG_BRAND}/posts/review`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty workflows list renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/workflows**');
    const route = '/workflows';
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty workflow executions renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/executions**');
    const route = '/workflows/executions';
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('empty orchestration runs renders its zero state', async ({
    authenticatedPage,
  }) => {
    await mockEmptyCollection(authenticatedPage, '**/agents**');
    await mockEmptyCollection(authenticatedPage, '**/tasks**');
    const route = `${ORG_BRAND}/orchestration/runs`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('analytics with empty analytics data stays healthy', async ({
    authenticatedPage,
  }) => {
    // Empty analytics is modelled as no rows; a 5xx-free empty payload exercises
    // the no-data branch without breaking auth/bootstrap.
    await mockEmptyCollection(authenticatedPage, '**/analytics**');
    await mockServerError(authenticatedPage, '**/posts**', 404);
    const route = `${ORG_BRAND}/analytics/posts`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });
});
