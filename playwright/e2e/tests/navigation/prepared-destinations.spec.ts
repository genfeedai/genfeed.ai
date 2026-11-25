import {
  generateMockPost,
  mockActiveSubscription,
  mockCalendarPosts,
  mockPostDetail,
  mockPostsList,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  delayServerRenders,
  isPrefetchRequest,
  PREFETCH_TIMEOUT_MS,
  readClickToCommitMs,
  recordNavigationTiming,
  SERVER_LATENCY_MS,
  trackPrefetches,
} from '@e2e/utils/instant-navigation';
import { expectCommitWithinBudget } from '@e2e/utils/navigation-budget';
import { PostStatus } from '@genfeedai/contracts';
import type { Page } from '@playwright/test';

const PREPARED_BUDGET_MS = 150;
const BRAND_BASE = '/test-org/brand-1';

// Controls whose destination is known at render prepare it on hover, focus or
// pointer down (#10062). The click then waits for nothing: the server render is
// delayed here so a destination that was not prepared shows as commit time.

function recordPrefetchedPaths(page: Page): string[] {
  const pathnames: string[] = [];
  page.on('request', (request) => {
    if (isPrefetchRequest(request)) {
      pathnames.push(new URL(request.url()).pathname);
    }
  });
  return pathnames;
}

test('the post remix link is prepared on hover and opens without a server render', async ({
  authenticatedPage: page,
}, testInfo) => {
  const post = generateMockPost({
    id: 'post-remix-001',
    label: 'Published launch post',
    platform: 'twitter',
    status: PostStatus.PUBLIC,
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockPostsList(page, [post]);
  await mockPostDetail(page, post);
  const isPrefetched = trackPrefetches(page);

  await expectCommitWithinBudget({
    budgetMs: PREPARED_BUDGET_MS,
    label: (elapsedMs) =>
      `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    measure: async () => {
      await page.goto(`${BRAND_BASE}/publishing/posts/post-remix-001`);
      await page
        .getByRole('button', { exact: true, name: 'More actions' })
        .click();
      const remix = page.getByRole('menuitem', { exact: true, name: 'Remix' });
      await expect(remix).toBeVisible();
      const href = (await remix.getAttribute('href')) ?? '';
      expect(href).toContain('postId=post-remix-001');

      await remix.hover();
      await expect
        .poll(() => isPrefetched(href.split('?')[0]), {
          message: 'remix destination is prepared on hover',
          timeout: PREFETCH_TIMEOUT_MS,
        })
        .toBe(true);
      await delayServerRenders(page);
      await recordNavigationTiming(page);

      await remix.click();
      await page.waitForURL((url) => url.pathname === href.split('?')[0]);
      await expect(page.locator('main').first()).toBeVisible();
      return readClickToCommitMs(page);
    },
    testInfo,
  });
});

test('a calendar item is prepared on hover and opens without a server render', async ({
  authenticatedPage: page,
}, testInfo) => {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  // An article opens its editor page, so the calendar prepares it on hover. A
  // post opens a drawer, which has no destination to prepare.
  const wednesday = new Date();
  wednesday.setUTCDate(
    wednesday.getUTCDate() - ((wednesday.getUTCDay() + 6) % 7) + 2,
  );
  wednesday.setUTCHours(11, 0, 0, 0);
  await mockCalendarPosts(
    page,
    [],
    [
      {
        attributes: {
          createdAt: wednesday.toISOString(),
          label: 'Prepared launch article',
          status: 'draft',
        },
        id: 'cal-prepared-article',
      },
    ],
  );
  const requested = recordPrefetchedPaths(page);
  const isPrefetched = trackPrefetches(page);
  const isArticleEditor = (pathname: string) =>
    pathname.endsWith('/publishing/posts/cal-prepared-article');

  await expectCommitWithinBudget({
    budgetMs: PREPARED_BUDGET_MS,
    label: (elapsedMs) =>
      `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    measure: async () => {
      requested.length = 0;
      await page.goto(`${BRAND_BASE}/publishing/calendar`);
      const item = page.getByText('Prepared launch article').first();
      await expect(item).toBeVisible();

      await item.hover();
      await expect
        .poll(
          () =>
            requested
              .filter(isArticleEditor)
              .some((pathname) => isPrefetched(pathname)),
          {
            message: 'the calendar item destination is prepared on hover',
            timeout: PREFETCH_TIMEOUT_MS,
          },
        )
        .toBe(true);
      await delayServerRenders(page);
      await recordNavigationTiming(page);

      await item.click();
      await page.waitForURL((url) => isArticleEditor(url.pathname));
      await expect(page.locator('main').first()).toBeVisible();
      return readClickToCommitMs(page);
    },
    testInfo,
  });
});

// One prepared detail page covers every id of its route: the page reads the id
// inside its own boundary, so the shell holds no id. Preparing post A must let
// a click on post B commit without a server render.
test('a prepared detail page opens any id of the same route without a server render', async ({
  authenticatedPage: page,
}, testInfo) => {
  const first = generateMockPost({ id: 'post-a', label: 'Post A' });
  const second = generateMockPost({ id: 'post-b', label: 'Post B' });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockPostsList(page, [first, second]);
  await mockPostDetail(page, second);
  const isPrefetched = trackPrefetches(page);

  await expectCommitWithinBudget({
    budgetMs: PREPARED_BUDGET_MS,
    label: (elapsedMs) =>
      `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    measure: async () => {
      await page.goto(`${BRAND_BASE}/publishing/posts`);
      const preparedLink = page
        .locator('a[href$="/publishing/posts/post-a"]')
        .first();
      const clickedLink = page
        .locator('a[href$="/publishing/posts/post-b"]')
        .first();
      await expect(preparedLink).toBeVisible();

      await preparedLink.hover();
      await expect
        .poll(() => isPrefetched(`${BRAND_BASE}/publishing/posts/post-a`), {
          message: 'post A is prepared on hover',
          timeout: PREFETCH_TIMEOUT_MS,
        })
        .toBe(true);
      await delayServerRenders(page);
      await recordNavigationTiming(page);

      await page.mouse.move(0, 0);
      await clickedLink.click();
      await page.waitForURL((url) =>
        url.pathname.endsWith('/publishing/posts/post-b'),
      );
      await expect(page.locator('main').first()).toBeVisible();
      return readClickToCommitMs(page);
    },
    testInfo,
  });
});
