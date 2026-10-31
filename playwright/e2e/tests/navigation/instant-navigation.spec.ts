import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { Page, Request } from '@playwright/test';

const SERVER_LATENCY_MS = 800;
const PREFETCH_QUIET_MS = 500;
const PREFETCH_TIMEOUT_MS = 30_000;
const INSTANT_BUDGET_MS = 400;
const NAVIGATION_TIMING_KEY = '__instantNavigationTiming';

interface NavigationTiming {
  clickedAt?: number;
  committedAt?: number;
}

function isPrefetchRequest(request: Request): boolean {
  return (
    request.url().includes('_rsc=') &&
    request.headers()['next-router-prefetch'] !== undefined
  );
}

// Next.js drains its prefetch queue newest-link-first with bounded
// concurrency, so how long the rail link waits behind the page's other links
// depends on CPU load and a fixed sleep after load races it. Track each
// pathname's prefetch requests so the test can wait for the route it is about
// to click: its page segment loaded and nothing for it still in flight.
// Prefetches started by a document that is then replaced never report
// finished or failed, and the new document's router cache does not hold their
// result, so a main-frame navigation starts the tracking over.
function trackPrefetches(page: Page): (pathname: string) => boolean {
  const inFlightByPath = new Map<string, Set<Request>>();
  const lastActivityByPath = new Map<string, number>();
  const pagePaths = new Set<string>();
  const settle = (request: Request) => {
    const { pathname } = new URL(request.url());
    inFlightByPath.get(pathname)?.delete(request);
    lastActivityByPath.set(pathname, Date.now());
  };
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      inFlightByPath.clear();
      lastActivityByPath.clear();
      pagePaths.clear();
    }
  });
  page.on('request', (request) => {
    if (!isPrefetchRequest(request)) {
      return;
    }
    const { pathname } = new URL(request.url());
    const inFlight = inFlightByPath.get(pathname) ?? new Set<Request>();
    inFlight.add(request);
    inFlightByPath.set(pathname, inFlight);
    lastActivityByPath.set(pathname, Date.now());
  });
  page.on('requestfinished', (request) => {
    if (!isPrefetchRequest(request)) {
      return;
    }
    settle(request);
    if (
      request.headers()['next-router-segment-prefetch']?.endsWith('/__PAGE__')
    ) {
      pagePaths.add(new URL(request.url()).pathname);
    }
  });
  page.on('requestfailed', (request) => {
    if (isPrefetchRequest(request)) {
      settle(request);
    }
  });
  return (pathname) =>
    pagePaths.has(pathname) &&
    (inFlightByPath.get(pathname)?.size ?? 0) === 0 &&
    Date.now() - (lastActivityByPath.get(pathname) ?? 0) >= PREFETCH_QUIET_MS;
}

// Delays only the renders a click waits for. Prefetches stay fast so a slow
// server cannot stretch the prefetch queue the test is waiting on.
async function delayServerRenders(page: Page): Promise<void> {
  await page.route(
    (url) =>
      url.searchParams.has('_rsc') || url.pathname.startsWith('/_next/data'),
    async (route) => {
      if (!isPrefetchRequest(route.request())) {
        await new Promise((resolve) => setTimeout(resolve, SERVER_LATENCY_MS));
      }
      await route.fallback();
    },
  );
}

// The router pushes history once the destination tree has committed, so
// click-to-pushState is the navigation time the user feels. Timing it in the
// page keeps Playwright's own round trips and polling intervals, which grow
// with CPU load, out of a budget that is about the app.
async function recordNavigationTiming(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const timing: NavigationTiming = {};
    Object.assign(window, { [key]: timing });
    document.addEventListener(
      'click',
      () => {
        timing.clickedAt = performance.now();
      },
      { capture: true, once: true },
    );
    const pushState = history.pushState.bind(history);
    history.pushState = (...args) => {
      if (timing.clickedAt !== undefined) {
        timing.committedAt ??= performance.now();
      }
      pushState(...args);
    };
  }, NAVIGATION_TIMING_KEY);
}

async function readClickToCommitMs(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const { clickedAt, committedAt }: NavigationTiming = Reflect.get(
      window,
      key,
    );
    return clickedAt === undefined || committedAt === undefined
      ? Number.POSITIVE_INFINITY
      : Math.round(committedAt - clickedAt);
  }, NAVIGATION_TIMING_KEY);
}

// A click on a rail destination must paint the destination without waiting for
// a server render: the link is prefetched on viewport entry and the visited
// route stays cached (#6227). The server render is delayed to make a missed
// prefetch visible as click-to-commit time.
test('rail navigation paints without waiting for a server render', async ({
  authenticatedPage: page,
}, testInfo) => {
  const placeholderRequests: string[] = [];
  const isPrefetched = trackPrefetches(page);
  page.on('request', (request) => {
    if (/%%drp:|%25%25drp/i.test(request.url())) {
      placeholderRequests.push(request.url());
    }
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  await page.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.ASSETS),
  );
  await expect(
    page.getByRole('heading', { name: 'All assets', exact: true }),
  ).toBeVisible();

  const target = page.getByTestId('app-rail-item-analytics');
  await expect(target).toBeVisible();
  const href = await target.getAttribute('href');
  expect(href).not.toContain('%%drp:');

  await expect
    .poll(() => isPrefetched(href ?? ''), {
      message: 'rail destination is prefetched on viewport entry',
      timeout: PREFETCH_TIMEOUT_MS,
    })
    .toBe(true);
  await delayServerRenders(page);
  await recordNavigationTiming(page);

  await target.click();
  await page.waitForURL((url) => url.pathname === href);
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.getByTestId('app-rail')).toBeVisible();
  const elapsedMs = await readClickToCommitMs(page);

  testInfo.annotations.push({
    description: `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    type: 'click-to-destination',
  });
  expect(elapsedMs).toBeLessThan(INSTANT_BUDGET_MS);
  expect(placeholderRequests).toEqual([]);
});

// Cached routes stay mounted while hidden, so shell overlays opened on one
// route must not survive navigating away and back.
test('an open shell popover closes on route change and stays closed on return', async ({
  authenticatedPage: page,
}) => {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  const origin = createBrandAppRoute(
    'test-org',
    'brand-1',
    APP_ROUTES.LIBRARY.ASSETS,
  );
  await page.goto(origin);

  const trigger = page.getByTestId('brand-switcher-trigger').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByRole('listbox');
  await expect(menu.first()).toBeVisible();

  const analytics = page.getByTestId('app-rail-item-analytics');
  const href = await analytics.getAttribute('href');
  await analytics.click();
  await page.waitForURL((url) => url.pathname === href);
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await page.goBack();
  await page.waitForURL((url) => url.pathname === origin);
  await expect(
    page.getByRole('heading', { name: 'All assets', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
