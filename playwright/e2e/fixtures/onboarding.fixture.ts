import { type BrowserContext, test as base, type Page } from '@playwright/test';
import {
  generateMockOrganization,
  generateMockUser,
  setupApiMocks,
} from '../utils/api-interceptor';
import { setupStrictNetworkGuard } from '../utils/network-guard';

/**
 * Onboarding Fixtures for Playwright E2E Tests
 *
 * Provides a pre-authenticated page context where the user has NOT completed
 * onboarding. All APIs are mocked — no real backend calls are made.
 *
 * @module onboarding.fixture
 */

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

interface OnboardingFixtures {
  /**
   * A page with mocked authentication for an onboarding user
   * (isOnboardingCompleted = false, onboardingStepsCompleted = [])
   */
  onboardingPage: Page;
}

// ----------------------------------------------------------------------------
// Mock Session Data
// ----------------------------------------------------------------------------

const MOCK_SESSION = {
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  organizationId: 'mock-org-id-e2e-test',
  sessionId: 'mock-session-id-e2e-onboarding',
  userId: 'mock-user-id-e2e-onboarding',
};

// ----------------------------------------------------------------------------
// Onboarding-Specific Mock Data
// ----------------------------------------------------------------------------

function generateOnboardingMockUser() {
  return {
    ...generateMockUser({
      email: 'onboarding@genfeed.ai',
      firstName: 'Test',
      id: MOCK_SESSION.userId,
      lastName: 'User',
    }),
    avatar: null,
    handle: '',
    isOnboardingCompleted: false,
    onboardingStepsCompleted: [],
    onboardingType: null,
  };
}

const MOCK_BRAND_SCRAPE_RESPONSE = {
  brandId: 'mock-brand-id',
  extractedData: {
    companyName: 'Mock Corp',
    description: 'A mock company for testing',
    primaryColor: '#3B82F6',
    scrapedAt: new Date().toISOString(),
    secondaryColor: '#10B981',
    sourceUrl: 'https://example.com',
  },
  knowledgeBaseId: 'mock-kb-id',
  message: 'Brand data extracted successfully',
  success: true,
};

// ----------------------------------------------------------------------------
// Auth Setup for Onboarding User
// ----------------------------------------------------------------------------

async function setupBetterAuthMocksForOnboarding(page: Page): Promise<void> {
  const mockUser = generateOnboardingMockUser();
  const mockOrg = generateMockOrganization({
    id: MOCK_SESSION.organizationId,
    name: 'Test Organization',
  });

  await page.route('**/v1/auth/session**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        session: {
          activeOrganizationId: mockOrg.id,
          expiresAt: MOCK_SESSION.expiresAt,
          id: MOCK_SESSION.sessionId,
          userId: mockUser.id,
        },
        user: {
          email: mockUser.email,
          id: mockUser.id,
          image: mockUser.imageUrl,
          name: [mockUser.firstName, mockUser.lastName]
            .filter(Boolean)
            .join(' '),
          publicMetadata: {
            isOnboardingCompleted: false,
            role: 'member',
          },
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/v1/auth/token**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ token: `mock-jwt-${MOCK_SESSION.sessionId}` }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function setupOnboardingApiMocks(page: Page): Promise<void> {
  const mockUser = generateOnboardingMockUser();

  // --- Onboarding-specific routes (registered BEFORE generic setupApiMocks) ---

  // POST /onboarding/account-type
  await page.route(
    '**/api.genfeed.ai/*/onboarding/account-type',
    async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          body: JSON.stringify({ success: true }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // POST /onboarding/brand-setup
  await page.route(
    '**/api.genfeed.ai/*/onboarding/brand-setup',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify(MOCK_BRAND_SCRAPE_RESPONSE),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // POST /onboarding/complete-funnel
  await page.route(
    '**/api.genfeed.ai/*/onboarding/complete-funnel',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // GET/PATCH /users/*/onboarding
  await page.route('**/api.genfeed.ai/*/users/*/onboarding', async (route) => {
    const method = route.request().method();

    if (method === 'PATCH' || method === 'PUT') {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
        onboardingType: null,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // PATCH /users/me
  await page.route('**/api.genfeed.ai/*/users/me', async (route) => {
    const method = route.request().method();

    if (method === 'PATCH' || method === 'PUT') {
      await route.fulfill({
        body: JSON.stringify({ ...mockUser, firstName: 'Updated' }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify(mockUser),
      contentType: 'application/json',
      status: 200,
    });
  });

  // POST /users/me/avatar (presigned URL)
  await page.route('**/api.genfeed.ai/*/users/me/avatar', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        publicUrl: 'https://cdn.genfeed.ai/avatars/mock-avatar.jpg',
        uploadUrl: 'https://s3.mock.amazonaws.com/upload?presigned=true',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // POST /users/me/explore
  await page.route('**/api.genfeed.ai/*/users/me/explore', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // PATCH /users/*/settings
  await page.route('**/api.genfeed.ai/*/users/*/settings', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // POST /services/*/connect (OAuth)
  await page.route('**/api.genfeed.ai/*/services/*/connect', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ url: 'https://mock-oauth.example.com/auth' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // POST /services/stripe/checkout
  await page.route(
    '**/api.genfeed.ai/*/services/stripe/checkout',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ url: '/onboarding/success' }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // POST /stripe/create-checkout-session
  await page.route(
    '**/api.genfeed.ai/*/stripe/create-checkout-session',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ url: '/onboarding/success' }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

async function setupAuthCookies(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      domain: 'localhost',
      httpOnly: true,
      name: '__session',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: MOCK_SESSION.sessionId,
    },
    {
      domain: 'localhost',
      httpOnly: false,
      name: '__client_uat',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: Date.now().toString(),
    },
    {
      domain: 'localhost',
      httpOnly: true,
      name: '__better_auth_db_jwt',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: `mock-jwt-token-${MOCK_SESSION.sessionId}`,
    },
  ]);
}

async function injectBetterAuthState(page: Page): Promise<void> {
  const mockUser = generateOnboardingMockUser();

  await page.addInitScript(
    (authState: {
      user: ReturnType<typeof generateOnboardingMockUser>;
      session: typeof MOCK_SESSION;
    }) => {
      const { user: userData, session: sessionData } = authState;

      (window as Record<string, unknown>).__better_auth_client_state = {
        session_id: sessionData.sessionId,
        sessions: [
          {
            id: sessionData.sessionId,
            status: 'active',
            user: {
              emailAddresses: [{ emailAddress: userData.email }],
              firstName: userData.firstName,
              id: userData.id,
              imageUrl: userData.imageUrl,
              lastName: userData.lastName,
              publicMetadata: {
                isOnboardingCompleted: false,
              },
            },
          },
        ],
        user_id: userData.id,
      };

      Object.defineProperty(window, '__better_auth_is_signed_in', {
        configurable: true,
        value: true,
        writable: false,
      });
    },
    { session: MOCK_SESSION, user: mockUser },
  );
}

async function setupAuthLocalStorage(page: Page): Promise<void> {
  await page.evaluate((sessionData) => {
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
      JSON.stringify({
        last_active_session_id: sessionData.sessionId,
        session_id: sessionData.sessionId,
        sessions: [
          {
            id: sessionData.sessionId,
            status: 'active',
            user_id: sessionData.userId,
          },
        ],
      }),
    );
  }, MOCK_SESSION);
}

// ----------------------------------------------------------------------------
// Extended Test with Onboarding Fixtures
// ----------------------------------------------------------------------------

export const test = base.extend<OnboardingFixtures>({
  onboardingPage: async ({ page, context }, runFixture) => {
    const networkGuard = await setupStrictNetworkGuard(page);

    // Set up authentication cookies
    await setupAuthCookies(context);

    // Inject Better Auth auth state BEFORE any page loads
    await injectBetterAuthState(page);

    // Set up Better Auth mocks with isOnboardingCompleted: false
    await setupBetterAuthMocksForOnboarding(page);

    // Set up onboarding-specific API mocks FIRST (higher priority)
    await setupOnboardingApiMocks(page);

    // Set up generic API mocks (lower priority fallback)
    await setupApiMocks(page);

    // Bootstrap by navigating to onboarding start
    await page.goto('/onboarding/brand', {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });
    await setupAuthLocalStorage(page);

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },
});

export { expect } from '@playwright/test';
