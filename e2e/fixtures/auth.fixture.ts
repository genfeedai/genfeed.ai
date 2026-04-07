import { type BrowserContext, test as base, type Page } from '@playwright/test';
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

/**
 * Authentication Fixtures for Playwright E2E Tests
 *
 * Provides pre-authenticated page contexts for testing protected routes.
 *
 * HOW AUTHENTICATION BYPASS WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Server-side  — proxy.ts detects `__playwright_test` cookie and skips all
 *    Clerk middleware, preventing redirect to /login for protected routes.
 *
 * 2. Client-side  — We mock Clerk's Frontend API (clerk.accounts.dev) so that
 *    ClerkProvider's SDK receives a fabricated active session.  With
 *    `isSuperAdmin: true` in publicMetadata the OnboardingGuard will pass
 *    through without checking subscription / onboarding completion.
 *
 * 3. Backend API  — setupApiMocks intercepts all API calls to both the prod
 *    host (api.genfeed.ai) and the local dev host (local.genfeed.ai:3010).
 *
 * Route ordering note: Playwright checks routes in REVERSE registration order
 * (last-registered = highest priority). setupClerkMocks() must therefore be
 * called AFTER setupApiMocks() so its more-specific Clerk patterns take
 * precedence over the generic catch-all in setupApiMocks.
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
const ADMIN_AUTH_BOOTSTRAP_PATH = '/overview/dashboard';
const AUTOMATION_AUTH_BOOTSTRAP_PATH = '/workflows';

// ----------------------------------------------------------------------------
// Setup Helpers
// ----------------------------------------------------------------------------

/**
 * Set cookies that signal the E2E bypass to both middleware and tests.
 * __playwright_test  → detected by proxy.ts to skip Clerk middleware
 * __session          → identifies the mock session (admin vs user)
 * __client_uat       → Clerk client update timestamp
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
        name: '__clerk_db_jwt',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        value: `mock-jwt-token-${session.sessionId}`,
      },
    ]),
  );
}

async function injectClerkAuthState(
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

      const clerkState = {
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

      (window as Record<string, unknown>).__clerk_client_state = clerkState;
      Object.defineProperty(window, '__clerk_is_signed_in', {
        configurable: true,
        value: true,
        writable: false,
      });

      localStorage.setItem(
        '__clerk_client_jwt',
        `mock-jwt-${sessionData.sessionId}`,
      );
      localStorage.setItem(
        'clerk-db-jwt',
        `mock-db-jwt-${sessionData.sessionId}`,
      );
      localStorage.setItem('__clerk_client', JSON.stringify(clerkState));
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
 * Intercept Clerk's Frontend API calls and return a fabricated active session.
 *
 * MUST be called AFTER setupApiMocks() so these more-specific patterns
 * take priority (Playwright checks routes in reverse registration order).
 *
 * publicMetadata includes isSuperAdmin: true so that OnboardingGuard's
 * hasEntitlement check passes without requiring a real Stripe subscription.
 */
async function setupClerkMocks(
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

  await injectClerkAuthState(page, mockUser, publicMetadata, session);

  const clerkUserPayload = {
    email_addresses: [
      {
        email_address: mockUser.email,
        id: 'mock-email-id',
        verification: { status: 'verified', strategy: 'email_code' },
      },
    ],
    first_name: mockUser.firstName,
    has_image: true,
    id: mockUser.id,
    image_url: mockUser.imageUrl,
    last_name: mockUser.lastName,
    organization_memberships: [
      {
        created_at: Date.now() - 86400000,
        id: 'mock-membership-id',
        organization: {
          created_at: Date.now() - 86400000,
          id: mockOrg.id,
          image_url: mockOrg.imageUrl,
          logo_url: null,
          name: mockOrg.name,
          slug: mockOrg.slug,
        },
        permissions: [],
        role: options.role === 'admin' ? 'org:admin' : 'org:member',
        updated_at: Date.now(),
      },
    ],
    primary_email_address_id: 'mock-email-id',
    public_metadata: publicMetadata,
    publicMetadata,
    username: null,
  };

  const clerkSessionPayload = {
    abandon_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    expire_at: Date.now() + 24 * 60 * 60 * 1000,
    id: session.sessionId,
    last_active_at: Date.now(),
    last_active_organization_id: mockOrg.id,
    status: 'active',
    user: clerkUserPayload,
  };

  const isClerkRequest = (url: string): boolean =>
    url.includes('clerk') || /\/clerk_[^/]+\//.test(url);

  // /v1/client — primary endpoint Clerk SDK calls on init to discover sessions
  await page.route('**/v1/client**', async (route) => {
    if (!isClerkRequest(route.request().url())) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        response: {
          id: 'mock-client-id',
          last_active_session_id: session.sessionId,
          session_id: session.sessionId,
          sessions: [clerkSessionPayload],
          sign_in: null,
          sign_up: null,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/v1/dev_browser**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        id: 'mock-dev-browser-id',
        object: 'dev_browser',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // /v1/client/sessions/:id/tokens — returns a JWT for active session
  await page.route('**/v1/client/sessions/*/tokens**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        jwt: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwMDAwMDAwMCwiaXNzIjoiaHR0cHM6Ly9lbmdhZ2VkLXBhbnRoZXItNzEuY2xlcmsuYWNjb3VudHMuZGV2Iiwic2lkIjoiJHtzZXNzaW9uLnNlc3Npb25JZH0iLCJzdWIiOiIke21vY2tVc2VyLmlkfSJ9.mock_signature`,
        object: 'token',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/*.clerk.accounts.dev/v1/sessions/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        expire_at: Date.now() + 24 * 60 * 60 * 1000,
        expireAt: session.expiresAt,
        id: session.sessionId,
        last_active_at: Date.now(),
        status: 'active',
        userId: mockUser.id,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/clerk.genfeed.ai/v1/sessions/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        expire_at: Date.now() + 24 * 60 * 60 * 1000,
        expireAt: session.expiresAt,
        id: session.sessionId,
        last_active_at: Date.now(),
        status: 'active',
        userId: mockUser.id,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/*.clerk.accounts.dev/v1/users/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify(clerkUserPayload),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/clerk.genfeed.ai/v1/users/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify(clerkUserPayload),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(
    '**/*.clerk.accounts.dev/v1/organizations/*',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          has_image: true,
          id: mockOrg.id,
          image_url: mockOrg.imageUrl,
          logo_url: null,
          name: mockOrg.name,
          slug: mockOrg.slug,
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
  await page.route('**/clerk.genfeed.ai/v1/organizations/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        has_image: true,
        id: mockOrg.id,
        image_url: mockOrg.imageUrl,
        logo_url: null,
        name: mockOrg.name,
        slug: mockOrg.slug,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // /v1/environment — clerk environment/config
  await page.route('**/v1/environment**', async (route) => {
    if (!isClerkRequest(route.request().url())) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        auth_config: {
          allowed_origins: [],
          cookieless_dev: false,
          single_session_mode: false,
          url_based_session_syncing: false,
        },
        display_config: {
          branded: false,
          captcha_public_key: null,
          captcha_widget_type: null,
          favicon_image_url: null,
          home_url: 'http://localhost:3000',
          logo_image_url: null,
          preferred_sign_in_strategy: 'password',
          sign_in_url: '/login',
          sign_up_url: '/sign-up',
          support_email: null,
        },
        user_settings: {
          attributes: {},
          password_settings: {},
          social: {},
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Fallback for any other Clerk API calls. Limit to /v1 so Clerk JS assets
  // can load normally instead of being replaced with JSON.
  await page.route('**/*.clerk.accounts.dev/v1/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ object: 'null', response: null }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/clerk.genfeed.ai/v1/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ object: 'null', response: null }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/clerk_*/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/v1/client')) {
      await route.fulfill({
        body: JSON.stringify({
          response: {
            id: 'mock-client-id',
            last_active_session_id: session.sessionId,
            session_id: session.sessionId,
            sessions: [clerkSessionPayload],
            sign_in: null,
            sign_up: null,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/environment')) {
      await route.fulfill({
        body: JSON.stringify({
          auth_config: {
            allowed_origins: [],
            cookieless_dev: false,
            single_session_mode: false,
            url_based_session_syncing: false,
          },
          display_config: {
            branded: false,
            captcha_public_key: null,
            captcha_widget_type: null,
            favicon_image_url: null,
            home_url: 'http://localhost:3000',
            logo_image_url: null,
            preferred_sign_in_strategy: 'password',
            sign_in_url: '/login',
            sign_up_url: '/sign-up',
            support_email: null,
          },
          user_settings: {
            attributes: {},
            password_settings: {},
            social: {},
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/client/sessions/') && url.includes('/tokens')) {
      await route.fulfill({
        body: JSON.stringify({
          jwt: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwMDAwMDAwMCwiaXNzIjoiaHR0cHM6Ly9lbmdhZ2VkLXBhbnRoZXItNzEuY2xlcmsuYWNjb3VudHMuZGV2Iiwic2lkIjoiJHtzZXNzaW9uLnNlc3Npb25JZH0iLCJzdWIiOiIke21vY2tVc2VyLmlkfSJ9.mock_signature`,
          object: 'token',
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/sessions/')) {
      await route.fulfill({
        body: JSON.stringify({
          expire_at: Date.now() + 24 * 60 * 60 * 1000,
          expireAt: session.expiresAt,
          id: session.sessionId,
          last_active_at: Date.now(),
          status: 'active',
          userId: mockUser.id,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/users/')) {
      await route.fulfill({
        body: JSON.stringify(clerkUserPayload),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/organizations/')) {
      await route.fulfill({
        body: JSON.stringify({
          has_image: true,
          id: mockOrg.id,
          image_url: mockOrg.imageUrl,
          logo_url: null,
          name: mockOrg.name,
          slug: mockOrg.slug,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ object: 'null', response: null }),
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
  adminPage: async ({ page, context }, use) => {
    const networkGuard = await setupStrictNetworkGuard(page);
    const adminOptions: MockUserOptions = {
      email: 'admin@genfeed.ai',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      userId: MOCK_ADMIN_SESSION.userId,
    };

    await setupAuthCookies(context, MOCK_ADMIN_SESSION);
    // API mocks first (lower priority), then Clerk mocks (higher priority)
    await setupApiMocks(page);
    await setupClerkMocks(page, adminOptions, MOCK_ADMIN_SESSION);
    await navigateAfterAuth(page, ADMIN_AUTH_BOOTSTRAP_PATH);

    await use(page);
    networkGuard.assertNoBlockedRequests();
  },

  authenticatedContext: async ({ context }, use) => {
    await setupAuthCookies(context);
    await use(context);
  },

  authenticatedPage: async ({ page, context }, use) => {
    const networkGuard = await setupStrictNetworkGuard(page);

    await setupAuthCookies(context);
    // API mocks first (lower priority), then Clerk mocks (higher priority)
    await setupApiMocks(page);
    await setupClerkMocks(page, {}, MOCK_SESSION);
    await navigateAfterAuth(page, APP_AUTH_BOOTSTRAP_PATH);

    await use(page);
    networkGuard.assertNoBlockedRequests();
  },

  automationPage: async ({ page, context }, use) => {
    const networkGuard = await setupStrictNetworkGuard(page);

    await setupAuthCookies(context);
    await setupApiMocks(page);
    await setupClerkMocks(page, {}, MOCK_SESSION);
    await mockWorkflowCrud(page, []);
    await mockWorkflowExecutions(page, []);
    await mockWorkflowTemplates(page, []);
    await navigateAfterAuth(page, AUTOMATION_AUTH_BOOTSTRAP_PATH);

    await use(page);
    networkGuard.assertNoBlockedRequests();
  },

  unauthenticatedPage: async ({ page }, use) => {
    const networkGuard = await setupStrictNetworkGuard(page);
    await setupApiMocks(page);

    // Return unauthenticated state from Clerk
    await page.route('**/v1/client**', async (route) => {
      if (!route.request().url().includes('clerk')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          response: {
            id: 'mock-client-id',
            last_active_session_id: null,
            sessions: [],
            sign_in: null,
            sign_up: null,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await use(page);
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
  await setupClerkMocks(page, options, session);
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
  await page.route('**/v1/client**', async (route) => {
    if (!route.request().url().includes('clerk')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        response: {
          id: 'mock-client-id',
          last_active_session_id: null,
          sessions: [],
          sign_in: null,
          sign_up: null,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}
