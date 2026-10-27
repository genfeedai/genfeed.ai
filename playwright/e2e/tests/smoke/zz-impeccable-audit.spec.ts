import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { SocialTimelineResponse } from '@genfeedai/contracts/interfaces';
import type { Page, Response } from '@playwright/test';
import {
  createPlaywrightMockApiRoutePattern,
  playwrightApiEndpoint,
} from '../../config/environment';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  buildReferralProgramMockBody,
  buildUnhandledApiMockBody,
} from '../../utils/api-interceptor';
import {
  assertNoErrorBoundaryFallback,
  FRAMEWORK_ERROR_OVERLAY_SELECTOR,
} from '../../utils/route-assertions';

const appRoot = path.join(process.cwd(), 'apps/app/app');
const routeFilter = process.env.GENFEED_E2E_ROUTE_FILTER;

const dynamicValues: Record<string, string> = {
  agentId: 'agent-1',
  brandSlug: 'brand-1',
  filter: 'all',
  handle: 'testuser',
  id: 'mock-id',
  orgSlug: 'test-org',
  platform: 'tiktok',
  runId: 'run-1',
  slug: 'brand-1',
  threadId: 'thread-1',
  type: 'image',
  view: 'unread',
};

function listPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listPageFiles(entryPath);
    }

    return entry.isFile() && entry.name === 'page.tsx' ? [entryPath] : [];
  });
}

function segmentToPath(segment: string): string | null {
  if (/^\(.+\)$/.test(segment)) {
    return null;
  }

  const dynamicMatch = segment.match(/^\[(.+)\]$/);

  if (dynamicMatch) {
    return dynamicValues[dynamicMatch[1] ?? ''] ?? 'mock-id';
  }

  return segment;
}

function pageFileToRoute(filePath: string): string {
  const relative = path.relative(appRoot, path.dirname(filePath));
  const segments =
    relative === ''
      ? []
      : relative
          .split(path.sep)
          .map(segmentToPath)
          .filter((segment): segment is string => Boolean(segment));

  return `/${segments.join('/')}`.replace(/\/+$/, '') || '/';
}

const routes = listPageFiles(appRoot)
  .map(pageFileToRoute)
  .filter((route, index, allRoutes) => allRoutes.indexOf(route) === index)
  .sort();

const publicRoutes = routes.filter(
  (route) =>
    route.startsWith('/agent-auth') ||
    route.startsWith('/forgot-password') ||
    route.startsWith('/login') ||
    route.startsWith('/logout') ||
    route.startsWith('/managed-credits') ||
    route.startsWith('/request-access') ||
    route.startsWith('/reset-password') ||
    route.startsWith('/sign-up'),
);

const oauthRoutes = routes.filter((route) => route.startsWith('/oauth'));

const onboardingRoutes = routes.filter((route) =>
  route.startsWith('/onboarding'),
);

const adminRoutes = routes.filter((route) => route.startsWith('/admin'));

const runtimeOwnedRoutes = routes.filter(
  (route) => route === '/desktop/local' || route === '/~offline',
);

const protectedRoutes = routes.filter(
  (route) =>
    !publicRoutes.includes(route) &&
    !oauthRoutes.includes(route) &&
    !onboardingRoutes.includes(route) &&
    !adminRoutes.includes(route) &&
    !runtimeOwnedRoutes.includes(route),
);

interface RouteBucket {
  name: string;
  routes: string[];
}

function routeBucket(
  name: string,
  routeList: string[],
  matches: (route: string) => boolean,
): RouteBucket {
  return { name, routes: routeList.filter(matches) };
}

function expectAllRoutesBucketed(
  sourceRoutes: string[],
  buckets: RouteBucket[],
): void {
  const bucketedRoutes = new Set(buckets.flatMap((bucket) => bucket.routes));
  const missingRoutes = sourceRoutes.filter(
    (route) => !bucketedRoutes.has(route),
  );

  expect(missingRoutes, missingRoutes.join('\n')).toEqual([]);
}

const protectedRouteBuckets: RouteBucket[] = [
  routeBucket(
    'protected root',
    protectedRoutes,
    (route) =>
      route === '/' ||
      route === '/connect' ||
      route === '/settings' ||
      route.startsWith('/settings/') ||
      route === '/test-org',
  ),
  routeBucket('protected analytics', protectedRoutes, (route) =>
    route.startsWith('/test-org/brand-1/analytics'),
  ),
  routeBucket('protected edit library', protectedRoutes, (route) =>
    /^\/test-org\/brand-1\/(edit|library)(\/|$)/.test(route),
  ),
  routeBucket('protected automation', protectedRoutes, (route) =>
    route.startsWith('/test-org/brand-1/automation'),
  ),
  routeBucket(
    'protected content operations',
    protectedRoutes,
    (route) =>
      route === '/test-org/brand-1' ||
      /^\/test-org\/brand-1\/(agent|discovery|messages|overview|platforms|publishing|studio|tasks|workflows|workspace)(\/|$)/.test(
        route,
      ),
  ),
  routeBucket('protected brand settings', protectedRoutes, (route) =>
    route.startsWith('/test-org/brand-1/settings'),
  ),
  routeBucket('protected organization workspace', protectedRoutes, (route) =>
    route.startsWith('/test-org/~/'),
  ),
];

const adminRouteBuckets: RouteBucket[] = [
  routeBucket('admin core', adminRoutes, (route) =>
    /^\/admin(\/agent(\/|$)|$)/.test(route),
  ),
  routeBucket('admin administration automation', adminRoutes, (route) =>
    /^\/admin\/(administration|automation)(\/|$)/.test(route),
  ),
  routeBucket('admin configuration', adminRoutes, (route) =>
    route.startsWith('/admin/configuration'),
  ),
  routeBucket('admin content', adminRoutes, (route) =>
    route.startsWith('/admin/content'),
  ),
  routeBucket('admin economics', adminRoutes, (route) =>
    route.startsWith('/admin/economics'),
  ),
  routeBucket('admin flags', adminRoutes, (route) =>
    route.startsWith('/admin/flags'),
  ),
  routeBucket('admin library media', adminRoutes, (route) =>
    /^\/admin\/(folders|images|library|videos)(\/|$)/.test(route),
  ),
  routeBucket('admin organization overview', adminRoutes, (route) =>
    /^\/admin\/(organization|overview)(\/|$)/.test(route),
  ),
  routeBucket('admin settings', adminRoutes, (route) =>
    route.startsWith('/admin/settings'),
  ),
];

function jsonResponse(response: ServerResponse, body: unknown) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function socialTimelinePayload(): SocialTimelineResponse {
  return { accounts: [] };
}

async function mockSocialTimelines(page: Page): Promise<void> {
  // This endpoint returns raw account data, not a JSON:API document.
  await page.route(
    createPlaywrightMockApiRoutePattern('social-timelines/?(?:\\?.*)?$'),
    async (route) => {
      await route.fulfill({
        body: JSON.stringify(socialTimelinePayload()),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

function collection(type: string) {
  return { data: [], meta: { page: 1, pageSize: 0, totalCount: 0 }, type };
}

function bootstrapPayload() {
  return {
    access: {
      brandId: 'brand-1',
      creditsBalance: 500,
      hasEverHadCredits: true,
      isOnboardingCompleted: true,
      isSuperAdmin: true,
      organizationId: 'mock-org-id-e2e-test',
      subscriptionStatus: 'active',
      subscriptionTier: 'pro',
      userId: 'mock-user-id-e2e-test',
    },
    brands: [
      {
        credentials: [],
        id: 'brand-1',
        label: 'Brand 1',
        name: 'Brand 1',
        organization: {
          id: 'mock-org-id-e2e-test',
          label: 'Test Organization',
          name: 'Test Organization',
          slug: 'test-org',
        },
        slug: 'brand-1',
      },
    ],
    currentUser: {
      authProviderId: 'mock-user-id-e2e-test',
      email: 'test@genfeed.ai',
      firstName: 'Test',
      id: 'mock-user-id-e2e-test',
      isOnboardingCompleted: true,
      lastName: 'User',
    },
    fleetCapabilities: {
      isByokEnabled: false,
      isFleetAvailable: false,
    },
    settings: {
      defaultAvatarIngredientId: null,
      defaultVoiceId: null,
      id: 'org-settings-1',
      isFleetNsfwVisible: false,
    },
    streak: null,
  };
}

function installReadinessPayload() {
  return {
    access: {
      byokConfiguredProviders: ['openai'],
      byokEnabled: true,
      runtimeMode: 'byok',
      selectedMode: 'server',
      serverDefaultsReady: true,
    },
    authMode: 'better_auth',
    billingMode: 'oss_local',
    localTools: {
      anyDetected: true,
      claude: true,
      codex: true,
      detected: ['Claude Code', 'Codex'],
    },
    providers: {
      anyConfigured: true,
      configured: ['OpenAI'],
      fal: false,
      imageGenerationReady: true,
      openai: true,
      replicate: false,
      textGenerationReady: true,
    },
    ui: {
      showBilling: false,
      showCloudUpgradeCta: true,
      showCredits: false,
      showPricing: false,
    },
    workspace: {
      brandId: 'brand-1',
      hasBrand: true,
      hasOrganization: true,
      organizationId: 'mock-org-id-e2e-test',
    },
  };
}

function getMockApiPort(): number {
  const endpoint = new URL(playwrightApiEndpoint);
  const isLocalEndpoint =
    ['localhost', '127.0.0.1', '[::1]', 'genfeed.localhost'].includes(
      endpoint.hostname,
    ) || endpoint.hostname.endsWith('.genfeed.localhost');

  return isLocalEndpoint
    ? Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80))
    : 3010;
}

async function startMockApiServer(): Promise<Server | null> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (
      request.method === 'GET' &&
      /^\/v1\/referrals\/me\/?$/.test(new URL(url, 'http://localhost').pathname)
    ) {
      jsonResponse(response, buildReferralProgramMockBody());
      return;
    }

    if (
      new URL(url, 'http://localhost').pathname.match(
        /^\/v1\/social-timelines\/?$/,
      )
    ) {
      jsonResponse(response, socialTimelinePayload());
      return;
    }

    if (new URL(url, 'http://localhost').pathname === '/v1/costs/summary') {
      jsonResponse(response, buildUnhandledApiMockBody(url));
      return;
    }

    if (url.startsWith('/v1/health')) {
      jsonResponse(response, { status: 'ok' });
      return;
    }

    if (url.startsWith('/v1/auth/bootstrap')) {
      jsonResponse(response, bootstrapPayload());
      return;
    }

    if (url.startsWith('/v1/onboarding/install-readiness')) {
      jsonResponse(response, installReadinessPayload());
      return;
    }

    if (
      url.startsWith('/v1/onboarding/complete-funnel') ||
      url.startsWith('/v1/onboarding/account-type') ||
      url.startsWith('/v1/onboarding/skip')
    ) {
      jsonResponse(response, { message: 'ok', success: true });
      return;
    }

    if (url.startsWith('/v1/users/me/brands')) {
      jsonResponse(response, bootstrapPayload().brands);
      return;
    }

    if (url.startsWith('/v1/users/me/organizations')) {
      jsonResponse(response, [
        {
          brand: { id: 'brand-1', label: 'Brand 1', slug: 'brand-1' },
          id: 'mock-org-id-e2e-test',
          isActive: true,
          label: 'Test Organization',
          slug: 'test-org',
        },
      ]);
      return;
    }

    if (url.startsWith('/v1/users/me')) {
      jsonResponse(response, bootstrapPayload().currentUser);
      return;
    }

    if (url.startsWith('/v1/admin/system-notifications')) {
      jsonResponse(response, buildUnhandledApiMockBody(url));
      return;
    }

    if (/^\/v1\/admin\/model-pricing\/?(?:\?|$)/.test(url)) {
      jsonResponse(response, buildUnhandledApiMockBody(url));
      return;
    }

    if (url.includes('/settings')) {
      jsonResponse(response, {
        data: { attributes: bootstrapPayload().settings },
      });
      return;
    }

    if (url.includes('/fleet-capabilities')) {
      jsonResponse(response, {
        data: { attributes: bootstrapPayload().fleetCapabilities },
      });
      return;
    }

    if (url.includes('/credits') || url.includes('/agent/credits')) {
      jsonResponse(response, { balance: 500, modelCosts: {} });
      return;
    }

    jsonResponse(response, collection('mock'));
  });

  return await new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(null);
        return;
      }

      reject(error);
    });

    // Bind dual-stack (::) so SSR requests to the configured local endpoint (which
    // resolves to IPv6 ::1 first) reaches the mock; IPv4-only binding made
    // API-dependent pages 500 with ECONNREFUSED ::1:3010.
    server.listen(getMockApiPort(), '0.0.0.0', () => {
      resolve(server);
    });
  });
}

async function assertRouteLoads(
  page: Page,
  route: string,
  options: { allowRedirectToLogin?: boolean } = {},
): Promise<void> {
  let response: Response | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await page.goto(route, {
        timeout: 180_000,
        waitUntil: 'commit',
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRedirectRace =
        message.includes('interrupted by another navigation') ||
        message.includes('Execution context was destroyed');

      if (isRedirectRace) {
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        break;
      }

      const isRetryableAbort = message.includes('net::ERR_ABORTED');

      if (!isRetryableAbort || attempt === 2) {
        throw error;
      }

      // Next can cancel an in-flight document request while a previous route
      // finishes redirecting under V8 coverage instrumentation. Retry only this
      // browser-level abort once; HTTP, timeout, and assertion failures remain
      // hard failures.
      await page.waitForTimeout(250);
    }
  }

  expect(response?.status() ?? 0, `${route} returned HTTP error`).toBeLessThan(
    400,
  );

  await page.locator('body').waitFor({ state: 'attached', timeout: 10_000 });

  await expect(
    page.locator(FRAMEWORK_ERROR_OVERLAY_SELECTOR),
    `${route} rendered a framework error overlay`,
  ).toHaveCount(0, { timeout: 1_000 });

  await assertNoErrorBoundaryFallback(page, route);

  if (!options.allowRedirectToLogin) {
    expect(page.url(), `${route} redirected to login`).not.toMatch(/\/login/);
  }

  let bodySignal = { textLength: 0, visibleNodeCount: 0 };
  try {
    bodySignal = await page.locator('body').evaluate((body) => {
      const visibleNodes = Array.from(body.querySelectorAll('*')).filter(
        (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        },
      );

      return {
        textLength: body.textContent?.trim().length ?? 0,
        visibleNodeCount: visibleNodes.length,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Execution context was destroyed')) {
      throw error;
    }
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await expect(page.locator('body')).toBeVisible();
    return;
  }

  expect(
    bodySignal.textLength + bodySignal.visibleNodeCount,
    `${route} rendered a blank body`,
  ).toBeGreaterThan(0);
}


const OUT = '/tmp/claude-0/audit';
const DETECT = '/tmp/claude-0/imp/work/node_modules/.bin/impeccable';

function slug(route: string): string {
  return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

async function domRuleChecks(page: Page) {
  return await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const main = document.querySelector('main') || document.body;
    const crumbs = document.querySelectorAll('nav[aria-label*="readcrumb" i], [data-testid*="breadcrumb" i], ol[class*="breadcrumb" i]');
    const isSrOnly = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width <= 2 || r.height <= 2 || s.clip !== 'auto' || s.clipPath !== 'none' || parseFloat(s.fontSize) < 12; };
    const headings = Array.from(main.querySelectorAll('h1,h2,h3')).filter((h) => visible(h) && !isSrOnly(h) && parseFloat(getComputedStyle(h).fontSize) >= 18).map((h) => h.tagName + ' ' + getComputedStyle(h).fontSize + ': ' + text(h));
    const errorState = /could not be loaded|wandered off|something went wrong|Try Again/i.test((main.textContent || ''));
    const naText = Array.from(main.querySelectorAll('td,span,div,p,dd,li')).filter((e) => e.children.length === 0 && /^\s*(N\/A|n\/a|null|undefined|NaN)\s*$/.test(e.textContent || '')).length;
    const filters = Array.from(main.querySelectorAll('[role="combobox"],select,input[type="date"],input[type="search"],[data-testid*="filter" i]')).filter(visible).map((e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('data-testid') || e.tagName) + '');
    const bigImgs = Array.from(main.querySelectorAll('img,svg')).filter((e) => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.width > 160 && r.height > 160 && !!e.closest('tr,li,[role="row"]'); }).length;
    const hasPagination = !!main.querySelector('[aria-label*="agination" i],[data-testid*="pagination" i]');
    const hasTable = !!main.querySelector('table,[role="table"],[role="grid"]');
    const toasts = document.querySelectorAll('[data-sonner-toast],[role="status"][class*="toast" i]').length;
    const hOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const emptyMain = (main.textContent || '').trim().length < 20;
    return { errorState, breadcrumbCount: crumbs.length, breadcrumb: crumbs[0] ? text(crumbs[0]) : null, contentHeadings: headings.slice(0, 6), naText, filtersInContent: filters.slice(0, 8), oversizedMedia: bigImgs, hasPagination, hasTable, toasts, hOverflow, emptyMain, title: document.title };
  });
}

function runDetector(route: string): unknown {
  try {
    const out = execFileSync(DETECT, ['detect', '--json', '--cdp', '9333', '--target', route === '/' ? 'localhost' : route], { encoding: 'utf8', timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out || '[]');
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    if (e.status === 2 && e.stdout) { try { return JSON.parse(e.stdout); } catch { /* fallthrough */ } }
    return { detectorError: (e.stderr || String(error)).slice(0, 400) };
  }
}

async function auditRoutes(page: Page, routesToCheck: string[], group: string, options: { allowRedirectToLogin?: boolean } = {}): Promise<void> {
  mkdirSync(`${OUT}/shots`, { recursive: true });
  const retry = existsSync('/tmp/claude-0/audit/_retry.txt') && process.env.AUDIT_RETRY === '1' ? new Set(readFileSync('/tmp/claude-0/audit/_retry.txt', 'utf8').split('\n')) : null;
  const filtered = retry ? routesToCheck.filter((r) => retry.has(r)) : routeFilter ? routesToCheck.filter((r) => r.includes(routeFilter)) : routesToCheck;
  for (const route of filtered) {
    await test.step(route, async () => {
      const result: Record<string, unknown> = { route, group };
      try {
        await assertRouteLoads(page, route, options);
        result.loaded = true;
      } catch (error) {
        result.loaded = false;
        result.loadError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      }
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        result.finalUrl = page.url();
        result.dom = await domRuleChecks(page);
        await page.screenshot({ path: `${OUT}/shots/${group}__${slug(route)}.png` });
        result.findings = runDetector(new URL(page.url()).pathname);
      } catch (error) {
        result.auditError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      }
      writeFileSync(`${OUT}/${group}__${slug(route)}.json`, JSON.stringify(result, null, 1));
    });
  }
}

test.describe('Impeccable audit', () => {
  test.setTimeout(3_600_000);
  let mockApiServer: Server | null = null;
  test.beforeAll(async () => { mockApiServer = await startMockApiServer(); });
  test.afterAll(async () => {
    await new Promise<void>((resolve) => { if (!mockApiServer) { resolve(); return; } mockApiServer.close(() => resolve()); });
  });

  test('audit protected app routes', async ({ authenticatedPage }) => {
    await mockSocialTimelines(authenticatedPage);
    await auditRoutes(authenticatedPage, protectedRoutes, 'app');
  });
  test('audit onboarding routes', async ({ authenticatedPage }) => {
    await auditRoutes(authenticatedPage, onboardingRoutes, 'onboarding');
  });
  test('audit admin routes', async ({ adminPage }) => {
    await auditRoutes(adminPage, adminRoutes, 'admin');
  });
});
