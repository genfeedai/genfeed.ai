import type { BrowserContext, Page } from '@playwright/test';
import {
  generateMockOrganization,
  generateMockUser,
  setupApiMocks,
} from '../utils/api-interceptor';
import { setupStrictNetworkGuard } from '../utils/network-guard';
import {
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from './api-mocks.fixture';
// Coverage-instrumented base: under E2E_COVERAGE=1 every spec that imports
// `test` from the fixtures is automatically wrapped in V8 coverage collection.
import { test as base } from './coverage.fixture';

/**
 * Authentication Fixtures for Playwright E2E Tests
 *
 * Provides pre-authenticated page contexts for testing protected routes.
 *
 * HOW AUTHENTICATION BYPASS WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Server-side  — proxy.ts detects `__playwright_test` cookie and skips all
 *    Better Auth middleware, preventing redirect to /login for protected routes.
 *
 * 2. Client-side  — We inject a fabricated Better Auth state into the page so
 *    the app-level auth helpers see an active session. With `isSuperAdmin: true`
 *    in publicMetadata the OnboardingGuard passes without checking subscription
 *    / onboarding completion.
 *
 * 3. Backend API  — setupApiMocks intercepts all API calls to both the prod
 *    host (api.genfeed.ai) and the local dev host (local.genfeed.ai:3010).
 *
 * Route ordering note: Playwright checks routes in REVERSE registration order
 * (last-registered = highest priority). setupBetterAuthMocks() must therefore be
 * called AFTER setupApiMocks() so its more-specific local `/v1/auth/*` patterns
 * take precedence over the generic catch-all in setupApiMocks.
 *
 * @module auth.fixture
 */

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

interface AuthFixtures {
  authenticatedPage: Page;
  adminPage: Page;
  automationPage: Page;
  unauthenticatedPage: Page;
  authenticatedContext: BrowserContext;
}

interface MockUserOptions {
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: 'admin' | 'member' | 'viewer';
  organizationId?: string;
  organizationName?: string;
}

// ----------------------------------------------------------------------------
// Mock Session Data
// ----------------------------------------------------------------------------

const MOCK_SESSION = {
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  organizationId: 'mock-org-id-e2e-test',
  sessionId: 'mock-session-id-e2e-test',
  userId: 'mock-user-id-e2e-test',
};

const MOCK_ADMIN_SESSION = {
  ...MOCK_SESSION,
  role: 'admin',
  sessionId: 'mock-admin-session-id-e2e-test',
  userId: 'mock-admin-user-id-e2e-test',
};

const APP_AUTH_BOOTSTRAP_PATH = '/workspace';
const ADMIN_AUTH_BOOTSTRAP_PATH = '/admin/overview/dashboard';
const AUTOMATION_AUTH_BOOTSTRAP_PATH = '/workflows';

// ----------------------------------------------------------------------------
// Setup Helpers
// ----------------------------------------------------------------------------

/**
 * Set cookies that signal the E2E bypass to both middleware and tests.
 * __playwright_test  → detected by proxy.ts to skip Better Auth middleware
 * __session          → identifies the mock session (admin vs user)
 * __client_uat       → Better Auth client update timestamp
 */
async function setupAuthCookies(
  context: BrowserContext,
  session: typeof MOCK_SESSION = MOCK_SESSION,
): Promise<void> {
  const cookieDomains = ['127.0.0.1', 'localhost'];

  await context.addCookies(
    cookieDomains.flatMap((domain) => [
      {
        domain,
        httpOnly: false,
        name: '__playwright_test',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        value: 'true',
      },
      {
        domain,
        httpOnly: true,
        name: '__session',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        value: session.sessionId,
      },
      {
        domain,
        httpOnly: false,
        name: '__client_uat',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        value: Math.floor(Date.now() / 1000).toString(),
      },
      {
        domain,
        httpOnly: true,
        name: '__better_auth_db_jwt',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        value: `mock-jwt-token-${session.sessionId}`,
      },
    ]),
  );
}

async function injectBetterAuthState(
  page: Page,
  mockUser: ReturnType<typeof generateMockUser>,
  publicMetadata: Record<string, unknown>,
  session: typeof MOCK_SESSION,
): Promise<void> {
  await page.addInitScript(
    ({
      authState,
    }: {
      authState: {
        publicMetadata: Record<string, unknown>;
        session: typeof MOCK_SESSION;
        user: ReturnType<typeof generateMockUser>;
      };
    }) => {
      const {
        publicMetadata: metadata,
        session: sessionData,
        user,
      } = authState;

      const betterAuthState = {
        session_id: sessionData.sessionId,
        sessions: [
          {
            id: sessionData.sessionId,
            lastActiveOrganizationId: sessionData.organizationId,
            status: 'active',
            user: {
              emailAddresses: [{ emailAddress: user.email }],
              firstName: user.firstName,
              id: user.id,
              imageUrl: user.imageUrl,
              lastName: user.lastName,
              organizationMemberships: [
                {
                  organization: {
                    id: sessionData.organizationId,
                    name: 'Test Organization',
                    slug: 'test-org',
                  },
                  role: metadata.role === 'admin' ? 'org:admin' : 'org:member',
                },
              ],
              publicMetadata: metadata,
            },
          },
        ],
        user_id: user.id,
      };

      (window as Record<string, unknown>).__better_auth_client_state =
        betterAuthState;
      Object.defineProperty(window, '__better_auth_is_signed_in', {
        configurable: true,
        value: true,
        writable: false,
      });

      localStorage.setItem(
        '__better_auth_client_jwt',
        `mock-jwt-${sessionData.sessionId}`,
      );
      localStorage.setItem(
        'better-auth-db-jwt',
        `mock-db-jwt-${sessionData.sessionId}`,
      );
      localStorage.setItem(
        '__better_auth_client',
        JSON.stringify(betterAuthState),
      );
    },
    {
      authState: {
        publicMetadata,
        session,
        user: mockUser,
      },
    },
  );
}

/**
 * Intercept Better Auth's Frontend API calls and return a fabricated active session.
 *
 * MUST be called AFTER setupApiMocks() so these more-specific patterns
 * take priority (Playwright checks routes in reverse registration order).
 *
 * publicMetadata includes isSuperAdmin: true so that OnboardingGuard's
 * hasEntitlement check passes without requiring a real Stripe subscription.
 */
async function setupBetterAuthMocks(
  page: Page,
  options: MockUserOptions = {},
  session = MOCK_SESSION,
): Promise<void> {
  const mockUser = generateMockUser({
    email: options.email ?? 'test@genfeed.ai',
    firstName: options.firstName ?? 'Test',
    id: options.userId ?? session.userId,
    lastName: options.lastName ?? 'User',
  });

  const mockOrg = generateMockOrganization({
    id: options.organizationId ?? session.organizationId,
    name: options.organizationName ?? 'Test Organization',
  });

  const publicMetadata = {
    brand: 'brand-1',
    // isSuperAdmin lets OnboardingGuard skip subscription + onboarding checks
    isSuperAdmin: true,
    organization: mockOrg.id,
    role: options.role ?? 'member',
  };

  await injectBetterAuthState(page, mockUser, publicMetadata, session);

  const sessionPayload = {
    session: {
      activeOrganizationId: mockOrg.id,
      expiresAt: session.expiresAt,
      id: session.sessionId,
      userId: mockUser.id,
    },
    user: {
      email: mockUser.email,
      id: mockUser.id,
      image: mockUser.imageUrl,
      name: [mockUser.firstName, mockUser.lastName].filter(Boolean).join(' '),
      publicMetadata,
    },
  };

  // Playwright matches routes in REVERSE registration order (last-registered =
  // highest priority). Register the broad catch-all FIRST so it has the LOWEST
  // priority, then the specific endpoints, so each specific mock wins over the
  // catch-all. Getting this order wrong makes the catch-all shadow the session
  // mock, useSession() resolves signed-out, and protected shells spin forever.

  // Lowest priority: anything under /v1/auth/* the client touches but we do not
  // explicitly mock (e.g. sign-out) returns an inert empty payload.
  await page.route('**/v1/auth/**', async (route) => {
    // /v1/auth/bootstrap is a Genfeed API endpoint (NOT a Better Auth client
    // call) mocked by setupApiMocks. setupBetterAuthMocks runs AFTER it, so this
    // catch-all would otherwise shadow it — fall through so the real bootstrap
    // payload (and thus accessState) loads instead of {data:null}.
    if (route.request().url().includes('/auth/bootstrap')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ data: null }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/v1/auth/jwks**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ keys: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/v1/auth/token**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ token: `mock-jwt-${session.sessionId}` }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Highest priority: Better Auth's client fetches GET /v1/auth/get-session
  // (NOT /v1/auth/session). This must win over the catch-all above.
  await page.route('**/v1/auth/get-session**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(sessionPayload),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Optional post-auth navigation used by convenience fixtures.
 * Server readiness is handled by Playwright webServer, not by this helper.
 */
async function navigateAfterAuth(page: Page, path: string): Promise<void> {
  await page.goto(path, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });

  // Wait for either the authenticated app shell or a non-login URL
  await page
    .waitForFunction(() => !window.location.pathname.startsWith('/login'), {
      timeout: 20_000,
    })
    .catch(() => {
      // Even if we're still on /login, let the test proceed — it will fail
      // with a more descriptive assertion error rather than a fixture timeout.
    });
}

// ----------------------------------------------------------------------------
// Extended Test with Auth Fixtures
// ----------------------------------------------------------------------------

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page, context }, runFixture) => {
    const networkGuard = await setupStrictNetworkGuard(page);
    const adminOptions: MockUserOptions = {
      email: 'admin@genfeed.ai',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      userId: MOCK_ADMIN_SESSION.userId,
    };

    await setupAuthCookies(context, MOCK_ADMIN_SESSION);
    // API mocks first (lower priority), then Better Auth mocks (higher priority)
    await setupApiMocks(page);
    await setupBetterAuthMocks(page, adminOptions, MOCK_ADMIN_SESSION);
    await navigateAfterAuth(page, ADMIN_AUTH_BOOTSTRAP_PATH);

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },

  authenticatedContext: async ({ context }, runFixture) => {
    await setupAuthCookies(context);
    await runFixture(context);
  },

  authenticatedPage: async ({ page, context }, runFixture) => {
    const networkGuard = await setupStrictNetworkGuard(page);

    await setupAuthCookies(context);
    // API mocks first (lower priority), then Better Auth mocks (higher priority)
    await setupApiMocks(page);
    await setupBetterAuthMocks(page, {}, MOCK_SESSION);
    await navigateAfterAuth(page, APP_AUTH_BOOTSTRAP_PATH);

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },

  automationPage: async ({ page, context }, runFixture) => {
    const networkGuard = await setupStrictNetworkGuard(page);

    await setupAuthCookies(context);
    await setupApiMocks(page);
    await setupBetterAuthMocks(page, {}, MOCK_SESSION);
    await mockWorkflowCrud(page, []);
    await mockWorkflowExecutions(page, []);
    await mockWorkflowTemplates(page, []);
    await navigateAfterAuth(page, AUTOMATION_AUTH_BOOTSTRAP_PATH);

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },

  unauthenticatedPage: async ({ page }, runFixture) => {
    const networkGuard = await setupStrictNetworkGuard(page);
    await setupApiMocks(page);

    // Return unauthenticated state from Better Auth
    await page.route('**/v1/auth/get-session**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ session: null, user: null }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },
});

export { expect } from '@playwright/test';

// ----------------------------------------------------------------------------
// Helpers for individual tests
// ----------------------------------------------------------------------------

export async function createAuthenticatedPage(
  page: Page,
  context: BrowserContext,
  options: MockUserOptions = {},
  bootstrapPath = APP_AUTH_BOOTSTRAP_PATH,
): Promise<Page> {
  const session = {
    ...MOCK_SESSION,
    organizationId: options.organizationId ?? MOCK_SESSION.organizationId,
    userId: options.userId ?? MOCK_SESSION.userId,
  };

  await setupAuthCookies(context, session);
  await setupApiMocks(page);
  await setupBetterAuthMocks(page, options, session);
  await navigateAfterAuth(page, bootstrapPath);

  return page;
}

export async function simulateLogout(page: Page): Promise<void> {
  await page.context().clearCookies();
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // Navigation-in-progress; best-effort
  }
}

export async function simulateSessionExpiry(page: Page): Promise<void> {
  await page.route('**/v1/auth/get-session**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ session: null, user: null }),
      contentType: 'application/json',
      status: 200,
    });
  });
}
