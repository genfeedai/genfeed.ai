import { waitRealTime } from '@e2e/utils/real-time';
import type { Page, Request } from '@playwright/test';

export const SERVER_LATENCY_MS = 800;
export const PREFETCH_TIMEOUT_MS = 30_000;
export const PREFETCH_QUIET_MS = 500;
const NAVIGATION_TIMING_KEY = '__instantNavigationTiming';

interface NavigationTiming {
  clickedAt?: number;
  committedAt?: number;
}

export function isPrefetchRequest(request: Request): boolean {
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
export function trackPrefetches(page: Page): (pathname: string) => boolean {
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
const pagesWithDelayedRenders = new WeakSet<Page>();

export async function delayServerRenders(page: Page): Promise<void> {
  if (pagesWithDelayedRenders.has(page)) {
    return;
  }
  pagesWithDelayedRenders.add(page);
  await page.route(
    (url) =>
      url.searchParams.has('_rsc') || url.pathname.startsWith('/_next/data'),
    async (route) => {
      if (!isPrefetchRequest(route.request())) {
        await waitRealTime(SERVER_LATENCY_MS);
      }
      await route.fallback();
    },
  );
}

// The router pushes history once the destination tree has committed, so
// click-to-pushState is the navigation time the user feels. Timing it in the
// page keeps Playwright's own round trips and polling intervals, which grow
// with CPU load, out of a budget that is about the app.
export async function recordNavigationTiming(page: Page): Promise<void> {
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

export async function readClickToCommitMs(page: Page): Promise<number> {
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
