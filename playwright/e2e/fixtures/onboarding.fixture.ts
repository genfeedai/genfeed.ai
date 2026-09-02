import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  type BrowserContext,
  test as base,
  type Page,
  type Request,
} from '@playwright/test';
import {
  generateMockApiUser,
  generateMockBrand,
  generateMockFleetCapabilities,
  generateMockOrganization,
  generateMockOrganizationSettings,
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
   * A page with mocked authentication for an onboarding user that starts at
   * `onboardingStepsCompleted: []` and *remembers* every step the app saves.
   * A stateless mock re-served an empty step list after the brand step, so
   * `OnboardingGuard` bounced the agent handoff straight back to
   * `/onboarding/brand` — the shipped app never does that.
   */
  onboardingPage: Page;
}

/** Per-page onboarding progress recorded from the app's own PATCH calls. */
interface OnboardingProgressState {
  completedSteps: string[];
  isOnboardingCompleted: boolean;
}

interface OnboardingProgressRequestPayload {
  isOnboardingCompleted?: unknown;
  onboardingStepsCompleted?: unknown;
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

function generateOnboardingMockUser(completedSteps: readonly string[] = []) {
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
    onboardingStepsCompleted: [...completedSteps],
    onboardingType: null,
  };
}

/**
 * Reads the step list off an onboarding PATCH. The request has no body on
 * some calls, and `postDataJSON()` throws rather than returning null there.
 */
function readCompletedSteps(request: Request): string[] | null {
  let body: unknown;

  try {
    body = request.postDataJSON();
  } catch {
    return null;
  }

  if (!body || typeof body !== 'object') {
    return null;
  }

  const steps = (body as OnboardingProgressRequestPayload)
    .onboardingStepsCompleted;

  if (!Array.isArray(steps)) {
    return null;
  }

  return steps.filter((step): step is string => typeof step === 'string');
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

function buildOnboardingBootstrapPayload(state: OnboardingProgressState) {
  const organization = generateMockOrganization({
    id: MOCK_SESSION.organizationId,
    name: 'Test Organization',
    slug: 'test-org',
  });

  return {
    access: {
      brandId: 'brand-1',
      creditsBalance: 500,
      hasEverHadCredits: true,
      isOnboardingCompleted: state.isOnboardingCompleted,
      isSuperAdmin: false,
      organizationId: organization.id,
      subscriptionStatus: 'active',
      subscriptionTier: 'pro',
      userId: MOCK_SESSION.userId,
    },
    brands: [
      {
        ...generateMockBrand(),
        organization,
      },
    ],
    currentUser: generateMockApiUser({
      id: MOCK_SESSION.userId,
      isOnboardingCompleted: state.isOnboardingCompleted,
      onboardingCompletedAt: state.isOnboardingCompleted
        ? '2026-03-10T10:00:00.000Z'
        : null,
      onboardingStepsCompleted: [...state.completedSteps],
      onboardingType: null,
    }),
    fleetCapabilities: generateMockFleetCapabilities(),
    settings: generateMockOrganizationSettings(),
    streak: null,
  };
}

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

async function setupOnboardingApiMocks(
  page: Page,
  state: OnboardingProgressState,
): Promise<void> {
  // --- Onboarding-specific routes (registered AFTER generic setupApiMocks) ---

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
      const savedSteps = readCompletedSteps(route.request());

      if (savedSteps) {
        state.completedSteps = savedSteps;
      }

      await route.fulfill({
        body: JSON.stringify({
          isOnboardingCompleted: false,
          onboardingStepsCompleted: state.completedSteps,
          onboardingType: null,
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        isOnboardingCompleted: false,
        onboardingStepsCompleted: state.completedSteps,
        onboardingType: null,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // PATCH /users/me
  await page.route('**/api.genfeed.ai/*/users/me', async (route) => {
    const method = route.request().method();
    const mockUser = {
      ...generateOnboardingMockUser(state.completedSteps),
      isOnboardingCompleted: state.isOnboardingCompleted,
    };

    if (method === 'PATCH' || method === 'PUT') {
      const body = route.request().postDataJSON() as
        | OnboardingProgressRequestPayload
        | undefined;

      if (typeof body?.isOnboardingCompleted === 'boolean') {
        state.isOnboardingCompleted = body.isOnboardingCompleted;
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...mockUser,
              firstName: 'Updated',
              isOnboardingCompleted: state.isOnboardingCompleted,
            },
            id: mockUser.id,
            type: 'users',
          },
        }),
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
      httpOnly: false,
      name: '__playwright_test',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: 'true',
    },
    {
      domain: '127.0.0.1',
      httpOnly: false,
      name: '__playwright_test',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: 'true',
    },
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

    // Per-page, so a test that walks the flow cannot leak completed steps into
    // the next one.
    const progressState: OnboardingProgressState = {
      completedSteps: [],
      isOnboardingCompleted: false,
    };

    // Set up authentication cookies
    await setupAuthCookies(context);

    // Inject Better Auth auth state BEFORE any page loads
    await injectBetterAuthState(page);

    // Set up Better Auth mocks with isOnboardingCompleted: false
    await setupBetterAuthMocksForOnboarding(page);

    // Register generic routes first. Playwright checks matching routes in
    // reverse registration order, so the stateful onboarding routes below get
    // first opportunity to handle overlapping /users/** progress requests.
    await setupApiMocks(page, {
      '**/auth/bootstrap**': async (route) => {
        await route.fulfill({
          body: JSON.stringify(buildOnboardingBootstrapPayload(progressState)),
          contentType: 'application/json',
          status: 200,
        });
      },
    });

    await setupOnboardingApiMocks(page, progressState);

    // Bootstrap by navigating to onboarding start
    await page.goto(APP_ROUTES.ONBOARDING.BRAND, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });
    await setupAuthLocalStorage(page);

    await runFixture(page);
    networkGuard.assertNoBlockedRequests();
  },
});

export { expect } from '@playwright/test';
