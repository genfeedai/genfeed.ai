import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { SocialTimelineResponse } from '@genfeedai/contracts/interfaces';
import type { Page, Response } from '@playwright/test';
import {
  createPlaywrightMockApiRoutePattern,
  playwrightApiEndpoint,
} from '../config/environment';
import { expect, test } from '../fixtures/auth.fixture';
import {
  buildReferralProgramMockBody,
  buildUnhandledApiMockBody,
} from './api-interceptor';
import {
  assertNoErrorBoundaryFallback,
  FRAMEWORK_ERROR_OVERLAY_SELECTOR,
} from './route-assertions';

export const appRoot = path.join(process.cwd(), 'apps/web/app');
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

export const routes = listPageFiles(appRoot)
  .map(pageFileToRoute)
  .filter((route, index, allRoutes) => allRoutes.indexOf(route) === index)
  .sort();

export const publicRoutes = routes.filter(
  (route) =>
    route.startsWith('/agent-auth') ||
    route.startsWith('/forgot-password') ||
    route.startsWith('/login') ||
    route.startsWith('/logout') ||
    route.startsWith('/managed-credits') ||
    route.startsWith('/preview') ||
    route.startsWith('/request-access') ||
    route.startsWith('/reset-password') ||
    route.startsWith('/sign-up'),
);

export const oauthRoutes = routes.filter((route) => route.startsWith('/oauth'));

export const onboardingRoutes = routes.filter((route) =>
  route.startsWith('/onboarding'),
);

export const adminRoutes = routes.filter((route) => route.startsWith('/admin'));

const runtimeOwnedRoutes = routes.filter(
  (route) => route === '/desktop/local' || route === '/~offline',
);

export const protectedRoutes = routes.filter(
  (route) =>
    !publicRoutes.includes(route) &&
    !oauthRoutes.includes(route) &&
    !onboardingRoutes.includes(route) &&
    !adminRoutes.includes(route) &&
    !runtimeOwnedRoutes.includes(route),
);

export interface RouteBucket {
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

export function expectAllRoutesBucketed(
  sourceRoutes: string[],
  buckets: RouteBucket[],
): void {
  const bucketedRoutes = new Set(buckets.flatMap((bucket) => bucket.routes));
  const missingRoutes = sourceRoutes.filter(
    (route) => !bucketedRoutes.has(route),
  );

  expect(missingRoutes, missingRoutes.join('\n')).toEqual([]);
}

export const protectedRouteBuckets: RouteBucket[] = [
  routeBucket(
    'protected root',
    protectedRoutes,
    (route) =>
      route === '/' ||
      route.startsWith('/connectors') ||
      route === '/settings' ||
      route.startsWith('/settings/') ||
      route.startsWith('/support/') ||
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
      /^\/test-org\/brand-1\/(agent|discovery|messages|overview|platforms|publishing|tasks|workflows|workspace)(\/|$)/.test(
        route,
      ),
  ),
  routeBucket('protected studio apps', protectedRoutes, (route) =>
    /^\/test-org\/brand-1\/(clipper|editor|motion|playground|storyboard|turbo)(\/|$)/.test(
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

export const adminRouteBuckets: RouteBucket[] = [
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
    /^\/admin\/(folders|library)(\/|$)/.test(route),
  ),
  routeBucket('admin accounts overview', adminRoutes, (route) =>
    /^\/admin\/(brands|organizations|overview|users)(\/|$)/.test(route),
  ),
  routeBucket('admin settings', adminRoutes, (route) =>
    route.startsWith('/admin/settings'),
  ),
];

function jsonResponse(response: ServerResponse, body: unknown) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

export function socialTimelinePayload(): SocialTimelineResponse {
  return { accounts: [] };
}

export async function mockSocialTimelines(page: Page): Promise<void> {
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
    server.listen(getMockApiPort(), '::', () => {
      resolve(server);
    });
  });
}

export async function assertRouteLoads(
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

export async function sweepRoutes(
  page: Page,
  routesToCheck: string[],
  options: { allowRedirectToLogin?: boolean } = {},
): Promise<void> {
  const filteredRoutes = routeFilter
    ? routesToCheck.filter((route) =>
        routeFilter.startsWith('=')
          ? route === routeFilter.slice(1)
          : route.includes(routeFilter),
      )
    : routesToCheck;
  const failures: string[] = [];

  if (routeFilter) {
    expect(
      filteredRoutes.length,
      `No routes matched GENFEED_E2E_ROUTE_FILTER=${routeFilter}`,
    ).toBeGreaterThan(0);
  }

  for (const route of filteredRoutes) {
    await test.step(route, async () => {
      try {
        await assertRouteLoads(page, route, options);
      } catch (error) {
        failures.push(
          `${route}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  expect(failures, failures.join('\n\n')).toEqual([]);
}

export function bucketNamed(buckets: RouteBucket[], name: string): RouteBucket {
  const bucket = buckets.find((candidate) => candidate.name === name);
  if (!bucket) {
    throw new Error(`Unknown route bucket: ${name}`);
  }

  return bucket;
}

export async function sweepProtectedBucket(
  page: Page,
  bucketName: string,
): Promise<void> {
  await mockSocialTimelines(page);
  await sweepRoutes(
    page,
    bucketNamed(protectedRouteBuckets, bucketName).routes,
  );
}

export async function sweepAdminBucket(
  page: Page,
  bucketName: string,
): Promise<void> {
  await sweepRoutes(page, bucketNamed(adminRouteBuckets, bucketName).routes);
}

/**
 * Registers the mock API lifecycle for one spec file. Call it inside the
 * `All App Pages` describe block of each sweep spec.
 */
export function useMockApiServer(): void {
  let mockApiServer: Server | null = null;

  test.beforeAll(async () => {
    mockApiServer = await startMockApiServer();
  });

  test.afterAll(async () => {
    if (!mockApiServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      mockApiServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
}

/**
 * The route sweep is split across the spec files in
 * `tests/smoke/all-app-pages/` so the nightly full tier can spread it over
 * shards (one file is one scheduling unit). Every route bucket must be named by
 * exactly one of those files; adding a bucket without a test fails here.
 */
export function expectEveryBucketHasOneTest(): void {
  const sweepDirectory = path.join(
    process.cwd(),
    'playwright/e2e/tests/smoke/all-app-pages',
  );
  const sources = readdirSync(sweepDirectory)
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => readFileSync(path.join(sweepDirectory, file), 'utf8'));

  for (const bucket of [...protectedRouteBuckets, ...adminRouteBuckets]) {
    const owners = sources.filter((source) =>
      source.includes(`'${bucket.name}'`),
    );
    expect(
      owners,
      `${bucket.name} must be swept by exactly one file`,
    ).toHaveLength(1);
  }
}
