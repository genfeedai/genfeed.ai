import { existsSync, readdirSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

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

const protectedRoutes = routes.filter(
  (route) =>
    !publicRoutes.includes(route) &&
    !oauthRoutes.includes(route) &&
    !onboardingRoutes.includes(route) &&
    !adminRoutes.includes(route),
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
      route === '/settings' ||
      route.startsWith('/settings/') ||
      route === '/test-org',
  ),
  routeBucket('protected analytics', protectedRoutes, (route) =>
    route.startsWith('/test-org/brand-1/analytics'),
  ),
  routeBucket(
    'protected compose editor lab library',
    protectedRoutes,
    (route) =>
      /^\/test-org\/brand-1\/(compose|editor|lab|library)(\/|$)/.test(route),
  ),
  routeBucket('protected orchestration', protectedRoutes, (route) =>
    route.startsWith('/test-org/brand-1/orchestration'),
  ),
  routeBucket('protected content operations', protectedRoutes, (route) =>
    /^\/test-org\/brand-1\/(messages|overview|posts|research|studio|tasks|workflows|workspace)(\/|$)/.test(
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
  routeBucket('admin fleet', adminRoutes, (route) =>
    route.startsWith('/admin/fleet'),
  ),
  routeBucket('admin darkroom library media', adminRoutes, (route) =>
    /^\/admin\/(darkroom|folders|images|library|videos)(\/|$)/.test(route),
  ),
  routeBucket('admin organization overview', adminRoutes, (route) =>
    /^\/admin\/(organization|overview)(\/|$)/.test(route),
  ),
];

function jsonResponse(response: ServerResponse, body: unknown) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
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
    darkroomCapabilities: {
      isByokEnabled: false,
      isDarkroomAvailable: false,
    },
    settings: {
      defaultAvatarIngredientId: null,
      defaultVoiceId: null,
      id: 'org-settings-1',
      isAdvancedMode: false,
      isDarkroomNsfwVisible: false,
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

function proactiveWorkspacePayload() {
  return {
    brand: {
      colors: ['#111827', '#f9fafb'],
      id: 'brand-1',
      name: 'Brand 1',
      voiceTone: 'clear, direct, practical',
    },
    claimedAt: new Date().toISOString(),
    organization: {
      id: 'mock-org-id-e2e-test',
      label: 'Test Organization',
    },
    outputs: [
      {
        description: 'A launch-ready social draft prepared for testing.',
        id: 'post-1',
        label: 'Launch draft',
        platform: 'tiktok',
      },
    ],
    prepPercent: 100,
    prepStage: 'ready',
    proactiveStatus: 'ready',
    success: true,
    summary: 'Your starter workspace is ready.',
  };
}

async function startMockApiServer(): Promise<Server | null> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';

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
      url.startsWith('/v1/onboarding/proactive-workspace') ||
      url.startsWith('/v1/onboarding/proactive-claim')
    ) {
      jsonResponse(response, proactiveWorkspacePayload());
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

    if (url.includes('/settings')) {
      jsonResponse(response, {
        data: { attributes: bootstrapPayload().settings },
      });
      return;
    }

    if (url.includes('/darkroom-capabilities')) {
      jsonResponse(response, {
        data: { attributes: bootstrapPayload().darkroomCapabilities },
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

    // Bind dual-stack (::) so the app's SSR fetch to `localhost:3010` (which
    // resolves to IPv6 ::1 first) reaches the mock; IPv4-only binding made
    // API-dependent pages 500 with ECONNREFUSED ::1:3010.
    server.listen(3010, '::', () => {
      resolve(server);
    });
  });
}

async function assertRouteLoads(
  page: Page,
  route: string,
  options: { allowRedirectToLogin?: boolean } = {},
): Promise<void> {
  const response: Response | null = await page.goto(route, {
    timeout: 180_000,
    waitUntil: 'commit',
  });

  expect(response?.status() ?? 0, `${route} returned HTTP error`).toBeLessThan(
    400,
  );

  await page.locator('body').waitFor({ state: 'attached', timeout: 10_000 });

  await expect(
    page.locator('[data-nextjs-dialog]'),
    `${route} rendered a framework error overlay`,
  ).toHaveCount(0, { timeout: 1_000 });

  if (!options.allowRedirectToLogin) {
    expect(page.url(), `${route} redirected to login`).not.toMatch(/\/login/);
  }

  const bodySignal = await page.locator('body').evaluate((body) => {
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

  expect(
    bodySignal.textLength + bodySignal.visibleNodeCount,
    `${route} rendered a blank body`,
  ).toBeGreaterThan(0);
}

async function sweepRoutes(
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

test.describe('All App Pages', () => {
  test.setTimeout(900_000);

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

  test('public pages render', async ({ unauthenticatedPage }) => {
    await sweepRoutes(unauthenticatedPage, publicRoutes, {
      allowRedirectToLogin: true,
    });
  });

  test('oauth callback pages render', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/services/*/verify**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await sweepRoutes(authenticatedPage, oauthRoutes);
  });

  test('onboarding pages render', async ({ authenticatedPage }) => {
    await sweepRoutes(authenticatedPage, onboardingRoutes);
  });

  for (const bucket of protectedRouteBuckets) {
    test(`${bucket.name} pages render`, async ({ authenticatedPage }) => {
      await sweepRoutes(authenticatedPage, bucket.routes);
    });
  }

  for (const bucket of adminRouteBuckets) {
    test(`${bucket.name} pages render`, async ({ adminPage }) => {
      await sweepRoutes(adminPage, bucket.routes);
    });
  }

  test('route discovery found app pages', () => {
    expect(existsSync(appRoot)).toBe(true);
    expect(routes.length).toBeGreaterThan(100);
    expectAllRoutesBucketed(protectedRoutes, protectedRouteBuckets);
    expectAllRoutesBucketed(adminRoutes, adminRouteBuckets);
  });
});
