import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { Page, Request } from '@playwright/test';

const ORG = 'test-org';
const BRAND = 'brand-1';
const SERVER_LATENCY_MS = 800;
const PREFETCH_QUIET_MS = 1_000;
const PREFETCH_TIMEOUT_MS = 30_000;
const COMMIT_BUDGET_MS = 150;
const NAVIGATION_TIMING_KEY = '__blockedRouteTiming';

interface NavigationTiming {
  clickedAt?: number;
  committedAt?: number;
  committedPath?: string;
}

interface BlockedRouteCase {
  /** Where the router lands. Defaults to the clicked address. */
  destination?: string;
  /** Page the person is on when they open it. Defaults to the Brand Kit. */
  from?: string;
  name: string;
  /** Address the person opens. */
  href: string;
}

const brandRoute = (path: string) => createBrandAppRoute(ORG, BRAND, path);

// Routes that redirect or read their URL parameters on the server have no page
// frame the router can prepare in advance, so every click on them waited on
// the server render (#10040).
const ROUTES_OPENED_FROM_A_BRAND_PAGE: BlockedRouteCase[] = [
  {
    href: brandRoute('/automation/library/twitter-reply'),
    name: 'an automation library type',
  },
  {
    destination: brandRoute(APP_ROUTES.CONNECTORS.AGENTS),
    href: brandRoute(APP_ROUTES.CONNECTORS.ROOT),
    name: 'the bare Connectors address',
  },
  {
    href: brandRoute('/platforms/twitter'),
    name: 'a platform home',
  },
  {
    href: brandRoute('/discovery/trends/platforms/twitter'),
    name: 'a trends platform page',
  },
  {
    // Shelves are opened from the Library sidebar, so the Library code is
    // already loaded when the person clicks.
    from: brandRoute(APP_ROUTES.LIBRARY.ASSETS),
    href: brandRoute('/library/shelf/approved'),
    name: 'a library shelf',
  },
  {
    destination: brandRoute(APP_ROUTES.WORKSPACE.OVERVIEW),
    href: `/${ORG}/${BRAND}`,
    name: 'the bare brand address',
  },
];

function isPrefetchRequest(request: Request): boolean {
  return (
    request.url().includes('_rsc=') &&
    request.headers()['next-router-prefetch'] !== undefined
  );
}

// Tracks the prefetch requests per pathname so a test clicks only once the
// router has everything it is going to prepare for that address, and the
// page's own prefetches have drained like they have for a person who has
// been on the page for a moment.
function trackPrefetches(page: Page): (pathname: string) => boolean {
  const inFlightByPath = new Map<string, Set<Request>>();
  const lastActivityByPath = new Map<string, number>();
  const inFlight = new Set<Request>();
  let lastActivityAt = 0;
  const settle = (request: Request) => {
    const { pathname } = new URL(request.url());
    inFlightByPath.get(pathname)?.delete(request);
    inFlight.delete(request);
    lastActivityByPath.set(pathname, Date.now());
    lastActivityAt = Date.now();
  };
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      inFlightByPath.clear();
      lastActivityByPath.clear();
      inFlight.clear();
      lastActivityAt = 0;
    }
  });
  page.on('request', (request) => {
    if (!isPrefetchRequest(request)) {
      return;
    }
    const { pathname } = new URL(request.url());
    const inFlightForPath = inFlightByPath.get(pathname) ?? new Set<Request>();
    inFlightForPath.add(request);
    inFlightByPath.set(pathname, inFlightForPath);
    inFlight.add(request);
    lastActivityByPath.set(pathname, Date.now());
    lastActivityAt = Date.now();
  });
  page.on('requestfinished', (request) => {
    if (isPrefetchRequest(request)) {
      settle(request);
    }
  });
  page.on('requestfailed', (request) => {
    if (isPrefetchRequest(request)) {
      settle(request);
    }
  });
  return (pathname) =>
    lastActivityByPath.has(pathname) &&
    (inFlightByPath.get(pathname)?.size ?? 0) === 0 &&
    inFlight.size === 0 &&
    Date.now() - lastActivityAt >= PREFETCH_QUIET_MS;
}

// Delays only the renders a click waits for. Prefetches stay fast.
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
// click-to-pushState is the time the person feels. Timed in the page so
// Playwright's own round trips stay out of a budget about the app.
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
    const record = () => {
      if (timing.clickedAt !== undefined) {
        timing.committedAt ??= performance.now();
        timing.committedPath = location.pathname;
      }
    };
    const pushState = history.pushState.bind(history);
    history.pushState = (...args) => {
      pushState(...args);
      record();
    };
    const replaceState = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      replaceState(...args);
      record();
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

async function prefetchThroughRouter(page: Page, href: string): Promise<void> {
  await page.evaluate((target) => {
    const nextRouter = Reflect.get(Reflect.get(window, 'next'), 'router');
    nextRouter.prefetch(target);
  }, href);
}

// Opens `href` through the router from a click, the way a link does. Routes
// with no link on screen get a throwaway trigger so the timing starts from a
// click like it does for a rail link.
async function clickRouterLink(page: Page, href: string): Promise<void> {
  await page.evaluate((target) => {
    const nextRouter = Reflect.get(Reflect.get(window, 'next'), 'router');
    const trigger = document.createElement('button');
    trigger.addEventListener('click', () => nextRouter.push(target));
    document.body.append(trigger);
    trigger.click();
    trigger.remove();
  }, href);
}

async function openFrom(page: Page, startPath: string): Promise<void> {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  await page.goto(startPath);
  await expect(page.locator('main').first()).toBeVisible();
}

for (const route of ROUTES_OPENED_FROM_A_BRAND_PAGE) {
  test(`${route.name} commits within the budget after a prefetch`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    const isPrefetched = trackPrefetches(page);
    await openFrom(
      page,
      route.from ?? brandRoute(APP_ROUTES.SETTINGS.BRAND_KIT),
    );

    await prefetchThroughRouter(page, route.href);
    await expect
      .poll(() => isPrefetched(new URL(route.href, page.url()).pathname), {
        message: `${route.href} is prefetched before the click`,
        timeout: PREFETCH_TIMEOUT_MS,
      })
      .toBe(true);
    await delayServerRenders(page);
    await recordNavigationTiming(page);

    await clickRouterLink(page, route.href);
    const destination = route.destination ?? route.href;
    await page.waitForURL((url) => url.pathname === destination);
    const elapsedMs = await readClickToCommitMs(page);

    testInfo.annotations.push({
      description: `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
      type: 'click-to-destination',
    });
    expect(elapsedMs).toBeLessThan(COMMIT_BUDGET_MS);
  });
}

test('the bare organization address commits within the budget after a prefetch', async ({
  authenticatedPage: page,
}, testInfo) => {
  const isPrefetched = trackPrefetches(page);
  await openFrom(
    page,
    createOrganizationAppRoute(ORG, APP_ROUTES.SETTINGS.GENERAL),
  );

  const href = `/${ORG}`;
  await prefetchThroughRouter(page, href);
  await expect
    .poll(() => isPrefetched(href), {
      message: `${href} is prefetched before the click`,
      timeout: PREFETCH_TIMEOUT_MS,
    })
    .toBe(true);
  await delayServerRenders(page);
  await recordNavigationTiming(page);

  await clickRouterLink(page, href);
  // The landing frame commits first; it then sends the person to the home app
  // of their only brand once the brand list is known.
  await expect
    .poll(() => readClickToCommitMs(page), { timeout: 5_000 })
    .not.toBe(Number.POSITIVE_INFINITY);
  const elapsedMs = await readClickToCommitMs(page);
  await page.waitForURL(
    (url) => url.pathname === brandRoute(APP_ROUTES.WORKSPACE.OVERVIEW),
  );

  testInfo.annotations.push({
    description: `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    type: 'click-to-destination',
  });
  expect(elapsedMs).toBeLessThan(COMMIT_BUDGET_MS);
});

// The organization-level Library and Publishing destinations are served by one
// catch-all page. From an organization page the rail links to them.
for (const appId of ['library', 'publishing'] as const) {
  test(`the ${appId} rail link on an organization page commits within the budget`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    const isPrefetched = trackPrefetches(page);
    await openFrom(
      page,
      createOrganizationAppRoute(ORG, APP_ROUTES.SETTINGS.GENERAL),
    );

    const target = page.getByTestId(`app-rail-item-${appId}`);
    await expect(target).toBeVisible();
    const href = await target.getAttribute('href');
    expect(href).toBe(
      createOrganizationAppRoute(
        ORG,
        appId === 'library'
          ? APP_ROUTES.LIBRARY.ASSETS
          : APP_ROUTES.PUBLISHING.OVERVIEW,
      ),
    );
    await expect
      .poll(() => isPrefetched(href ?? ''), {
        message: 'rail destination is prefetched before the click',
        timeout: PREFETCH_TIMEOUT_MS,
      })
      .toBe(true);
    await delayServerRenders(page);
    await recordNavigationTiming(page);

    await target.click();
    await page.waitForURL((url) => url.pathname === href);
    const elapsedMs = await readClickToCommitMs(page);

    testInfo.annotations.push({
      description: `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
      type: 'click-to-destination',
    });
    expect(elapsedMs).toBeLessThan(COMMIT_BUDGET_MS);
  });
}
