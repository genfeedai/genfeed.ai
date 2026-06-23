import { createServer, type Server, type ServerResponse } from 'node:http';
import { expect, type Page, type Response, test } from '@playwright/test';

/**
 * Real-Better Auth authenticated route smoke.
 *
 * Unlike all-app-pages.spec.ts (fully-mocked auth via fake cookies + Better Auth FAPI
 * mock + the __playwright_test bypass), this spec runs under a REAL Better Auth
 * session supplied by the `app-authed` project's storageState (written by
 * playwright/e2e/auth.setup.ts). It exercises the genuine proxy.ts / authMiddleware path,
 * while backend DATA is still served by a local mock API on :3010.
 *
 * The mock API binds dual-stack (::) so the app's SSR fetch to `localhost:3010`
 * (which resolves to IPv6 ::1 first) reaches it.
 */

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
    darkroomCapabilities: { isByokEnabled: false, isDarkroomAvailable: false },
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
      detected: ['Claude Code'],
    },
    providers: {
      anyConfigured: true,
      configured: ['OpenAI'],
      imageGenerationReady: true,
      openai: true,
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

function startMockApiServer(): Promise<Server | null> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    if (url.startsWith('/v1/health'))
      return jsonResponse(response, { status: 'ok' });
    if (url.startsWith('/v1/auth/bootstrap'))
      return jsonResponse(response, bootstrapPayload());
    if (url.startsWith('/v1/onboarding/install-readiness'))
      return jsonResponse(response, installReadinessPayload());
    if (url.startsWith('/v1/users/me/brands'))
      return jsonResponse(response, bootstrapPayload().brands);
    if (url.startsWith('/v1/users/me/organizations'))
      return jsonResponse(response, [
        {
          brand: { id: 'brand-1', label: 'Brand 1', slug: 'brand-1' },
          id: 'mock-org-id-e2e-test',
          isActive: true,
          label: 'Test Organization',
          slug: 'test-org',
        },
      ]);
    if (url.startsWith('/v1/users/me'))
      return jsonResponse(response, bootstrapPayload().currentUser);
    if (url.includes('/settings'))
      return jsonResponse(response, {
        data: { attributes: bootstrapPayload().settings },
      });
    if (url.includes('/credits'))
      return jsonResponse(response, { balance: 500, modelCosts: {} });
    return jsonResponse(response, collection('mock'));
  });

  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') return resolve(null);
      reject(error);
    });
    // Dual-stack bind so SSR fetch to localhost:3010 (::1) reaches the mock.
    server.listen(3010, '::', () => resolve(server));
  });
}

async function assertRouteLoads(page: Page, route: string): Promise<void> {
  const response: Response | null = await page.goto(route, {
    timeout: 180_000,
    waitUntil: 'domcontentloaded',
  });

  expect(response?.status() ?? 0, `${route} returned HTTP error`).toBeLessThan(
    400,
  );
  expect(
    page.url(),
    `${route} bounced to /login (real session not honored)`,
  ).not.toMatch(/\/login/);
  await expect(
    page.locator('[data-nextjs-dialog]'),
    `${route} rendered a framework error overlay`,
  ).toHaveCount(0, { timeout: 1_000 });

  const bodySignal = await page.locator('body').evaluate((body) => ({
    textLength: body.textContent?.trim().length ?? 0,
    visibleNodeCount: body.querySelectorAll('*').length,
  }));
  expect(
    bodySignal.textLength + bodySignal.visibleNodeCount,
    `${route} rendered a blank body`,
  ).toBeGreaterThan(0);
}

// Auth-dependent routes that 500'd / bounced to /login under the broken bypass
// and must now render with a real session. Limited to routes with a direct
// page.tsx — index-less segments (overview/library/compose) redirect to a
// data-dependent child and are non-deterministic for a smoke.
const PROTECTED_ROUTES = [
  '/',
  '/settings',
  '/test-org',
  '/test-org/brand-1/workflows',
  '/test-org/brand-1/posts',
  '/test-org/brand-1/tasks',
  '/test-org/brand-1/editor',
  '/test-org/brand-1/workspace',
];

test.describe('Authenticated route smoke (real Better Auth session)', () => {
  test.setTimeout(600_000);

  let mockApiServer: Server | null = null;

  test.beforeAll(async () => {
    mockApiServer = await startMockApiServer();
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!mockApiServer) return resolve();
      mockApiServer.close(() => resolve());
    });
  });

  test('protected routes render under a real session', async ({ page }) => {
    const failures: string[] = [];
    for (const route of PROTECTED_ROUTES) {
      await test.step(route, async () => {
        try {
          await assertRouteLoads(page, route);
        } catch (error) {
          failures.push(
            `${route}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    }
    expect(failures, failures.join('\n\n')).toEqual([]);
  });
});
