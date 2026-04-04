import type { Page, Route } from '@playwright/test';

/**
 * API Interceptor for Playwright E2E Tests
 *
 * CRITICAL: This module intercepts ALL API calls to prevent real backend operations.
 * It ensures tests never trigger actual AI generation, billing, or external services.
 *
 * @module api-interceptor
 */

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

interface MockUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface MockIngredient {
  id: string;
  type: string;
  status: string;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface MockSubscription {
  id: string;
  status: string;
  plan: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

interface MockBrand {
  id: string;
  name: string;
  label: string;
  slug: string;
  imageUrl: string;
  description: string;
  scope: string;
  credentials: unknown[];
  links: unknown[];
  createdAt: string;
  updatedAt: string;
  isDarkroomEnabled: boolean;
}

interface MockOrganizationSettings {
  id: string;
  isAdvancedMode: boolean;
  isDarkroomNsfwVisible: boolean;
  defaultAvatarIngredientId: string | null;
  defaultVoiceId: string | null;
  defaultVoiceRef: {
    provider: string;
    voiceId: string;
  } | null;
}

interface MockDarkroomCapabilities {
  isByokEnabled: boolean;
  isDarkroomAvailable: boolean;
}

interface JsonApiDocument<T> {
  data: {
    id: string;
    type: string;
    attributes: T;
  };
}

interface JsonApiCollectionDocument<T> {
  data: Array<{
    id: string;
    type: string;
    attributes: T;
  }>;
  meta?: {
    totalCount: number;
    page: number;
    pageSize: number;
  };
}

// ----------------------------------------------------------------------------
// Mock Data Generators
// ----------------------------------------------------------------------------

export function generateMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    createdAt: new Date().toISOString(),
    email: 'test@genfeed.ai',
    firstName: 'Test',
    id: 'mock-user-id-12345',
    imageUrl: 'https://cdn.genfeed.ai/avatars/default.png',
    lastName: 'User',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generates a mock IUser payload suitable for API responses.
 * Includes isOnboardingCompleted: true so OnboardingGuard passes through.
 */
export function generateMockApiUser(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    avatar: 'https://cdn.genfeed.ai/avatars/default.png',
    clerkId: 'mock-user-id-e2e-test',
    createdAt: new Date().toISOString(),
    email: 'test@genfeed.ai',
    firstName: 'Test',
    handle: 'testuser',
    id: 'mock-user-id-e2e-test',
    isOnboardingCompleted: true,
    lastName: 'User',
    onboardingCompletedAt: new Date(Date.now() - 86400000).toISOString(),
    onboardingStepsCompleted: ['profile', 'organization', 'subscription'],
    onboardingType: 'creator',
    settings: {
      id: 'mock-settings-id',
      isFirstLogin: false,
      language: 'en',
      notifications: true,
      theme: 'dark',
      timezone: 'UTC',
    },
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function generateMockOrganization(
  overrides: Partial<MockOrganization> = {},
): MockOrganization {
  return {
    createdAt: new Date().toISOString(),
    id: 'mock-org-id-12345',
    imageUrl: 'https://cdn.genfeed.ai/orgs/default.png',
    name: 'Test Organization',
    slug: 'test-org',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function generateMockBrand(
  overrides: Partial<MockBrand> = {},
): MockBrand {
  return {
    createdAt: new Date().toISOString(),
    credentials: [],
    description: 'Default mock brand',
    id: 'brand-1',
    imageUrl: 'https://cdn.genfeed.ai/mock/brands/brand-1.png',
    isDarkroomEnabled: false,
    label: 'Brand 1',
    links: [],
    name: 'Brand 1',
    scope: 'private',
    slug: 'brand-1',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function generateMockOrganizationSettings(
  overrides: Partial<MockOrganizationSettings> = {},
): MockOrganizationSettings {
  return {
    defaultAvatarIngredientId: null,
    defaultVoiceId: null,
    defaultVoiceRef: null,
    id: 'org-settings-1',
    isAdvancedMode: false,
    isDarkroomNsfwVisible: false,
    ...overrides,
  };
}

export function generateMockDarkroomCapabilities(
  overrides: Partial<MockDarkroomCapabilities> = {},
): MockDarkroomCapabilities {
  return {
    isByokEnabled: false,
    isDarkroomAvailable: false,
    ...overrides,
  };
}

export function generateMockIngredient(
  type: string,
  overrides: Partial<MockIngredient> = {},
): MockIngredient {
  const baseId = `mock-${type}-${Date.now()}`;
  return {
    createdAt: new Date().toISOString(),
    id: baseId,
    status: 'completed',
    thumbnailUrl: `https://cdn.genfeed.ai/mock/${type}/${baseId}-thumb.jpg`,
    type,
    updatedAt: new Date().toISOString(),
    url: `https://cdn.genfeed.ai/mock/${type}/${baseId}.${type === 'video' ? 'mp4' : 'png'}`,
    ...overrides,
  };
}

export function generateMockSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  return {
    currentPeriodEnd: nextMonth.toISOString(),
    currentPeriodStart: now.toISOString(),
    id: 'mock-subscription-id-12345',
    plan: 'pro',
    status: 'active',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// JSON:API Response Helpers
// ----------------------------------------------------------------------------

function wrapInJsonApi<T>(
  data: T,
  type: string,
  id: string,
): JsonApiDocument<T> {
  return {
    data: {
      attributes: data,
      id,
      type,
    },
  };
}

function wrapCollectionInJsonApi<T>(
  items: T[],
  type: string,
  idPrefix: string,
): JsonApiCollectionDocument<T> {
  return {
    data: items.map((item, index) => ({
      attributes: item,
      id: `${idPrefix}-${index}`,
      type,
    })),
    meta: {
      page: 1,
      pageSize: items.length,
      totalCount: items.length,
    },
  };
}

function buildProtectedAppBootstrapPayload() {
  return {
    access: {
      brandId: 'brand-1',
      creditsBalance: 1000,
      hasEverHadCredits: true,
      isOnboardingCompleted: true,
      isSuperAdmin: true,
      organizationId: 'mock-org-id-e2e-test',
      subscriptionStatus: 'active',
      subscriptionTier: 'pro',
      userId: 'mock-user-id-e2e-test',
    },
    brands: [generateMockBrand()],
    currentUser: generateMockApiUser(),
    darkroomCapabilities: generateMockDarkroomCapabilities(),
    settings: generateMockOrganizationSettings(),
    streak: null,
  };
}

// ----------------------------------------------------------------------------
// Route Handlers
// ----------------------------------------------------------------------------

async function _handleAuthRoutes(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.includes('/session')) {
    await route.fulfill({
      body: JSON.stringify({
        sessionId: 'mock-session-id',
        status: 'active',
        userId: 'mock-user-id-12345',
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/user')) {
    await route.fulfill({
      body: JSON.stringify(generateMockUser()),
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
}

async function handleOrganizationRoutes(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.endsWith('/mine') || url.includes('/mine?')) {
    await route.fulfill({
      body: JSON.stringify([
        {
          brand: { id: 'brand-1', label: 'Brand 1' },
          id: 'mock-org-id-e2e-test',
          isActive: true,
          label: 'Organization',
        },
      ]),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/streaks/me')) {
    await route.fulfill({
      body: JSON.stringify({
        badgeMilestones: [],
        currentStreak: 0,
        id: 'mock-streak-id',
        lastActivityDate: null,
        longestStreak: 0,
        milestoneHistory: [],
        milestoneStates: [],
        milestones: [],
        nextMilestone: null,
        status: 'idle',
        streakFreezes: 0,
        totalContentDays: 0,
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/switch/')) {
    await route.fulfill({
      body: JSON.stringify({
        brand: { id: 'brand-1', label: 'Brand 1' },
        organization: { id: 'mock-org-id-e2e-test', label: 'Organization' },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.endsWith('/create')) {
    await route.fulfill({
      body: JSON.stringify({
        brand: { id: 'brand-1', label: 'Brand 1' },
        organization: { id: 'mock-org-id-e2e-test', label: 'Organization' },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/darkroom-capabilities')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockDarkroomCapabilities(),
          'darkroom-capabilities',
          'mock-darkroom-capabilities',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/settings')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockOrganizationSettings(),
          'organization-settings',
          'mock-organization-settings',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/members')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          [
            {
              joinedAt: new Date().toISOString(),
              role: 'admin',
              userId: 'mock-user-id-12345',
            },
          ],
          'members',
          'member',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapInJsonApi(generateMockOrganization(), 'organizations', 'mock-org-id'),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleVideoRoutes(route: Route): Promise<void> {
  const url = route.request().url();
  const method = route.request().method();

  // Video generation - CRITICAL: Never call real AI
  if (method === 'POST' && !url.includes('/')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            ...generateMockIngredient('video'),
            progress: 0,
            status: 'processing',
          },
          'videos',
          'mock-video-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  // Video operations (merge, upscale, etc.)
  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockIngredient('video'),
          'videos',
          'mock-video-processed',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // GET single video
  if (method === 'GET' && url.match(/\/videos\/[^/]+$/)) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockIngredient('video'),
          'videos',
          'mock-video-single',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // GET video list
  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [
          generateMockIngredient('video'),
          generateMockIngredient('video'),
          generateMockIngredient('video'),
        ],
        'videos',
        'mock-video',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleImageRoutes(route: Route): Promise<void> {
  const url = route.request().url();
  const method = route.request().method();

  // Image generation - CRITICAL: Never call real AI
  if (method === 'POST' && !url.includes('/')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            ...generateMockIngredient('image'),
            status: 'processing',
          },
          'images',
          'mock-image-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  // Image operations (upscale, reframe, split)
  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockIngredient('image'),
          'images',
          'mock-image-processed',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // GET single image
  if (method === 'GET' && url.match(/\/images\/[^/]+$/)) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockIngredient('image'),
          'images',
          'mock-image-single',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // GET image list
  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [
          generateMockIngredient('image'),
          generateMockIngredient('image'),
          generateMockIngredient('image'),
        ],
        'images',
        'mock-image',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleMusicRoutes(route: Route): Promise<void> {
  const method = route.request().method();

  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            ...generateMockIngredient('music'),
            status: 'processing',
          },
          'musics',
          'mock-music-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [generateMockIngredient('music'), generateMockIngredient('music')],
        'musics',
        'mock-music',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleAvatarRoutes(route: Route): Promise<void> {
  const method = route.request().method();

  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            ...generateMockIngredient('avatar'),
            status: 'processing',
          },
          'avatars',
          'mock-avatar-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [generateMockIngredient('avatar'), generateMockIngredient('avatar')],
        'avatars',
        'mock-avatar',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleBillingRoutes(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.includes('/subscriptions')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockSubscription(),
          'subscriptions',
          'mock-subscription',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/credits')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            available: 1000,
            total: 1250,
            used: 250,
          },
          'credits',
          'mock-credits',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/invoices')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          [
            {
              amount: 2999,
              date: new Date().toISOString(),
              id: 'inv_001',
              status: 'paid',
            },
          ],
          'invoices',
          'mock-invoice',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // Default billing response
  await route.fulfill({
    body: JSON.stringify({ success: true }),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleAnalyticsRoutes(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.includes('/activities')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          [
            {
              metadata: { videoId: 'mock-video-1' },
              timestamp: new Date().toISOString(),
              type: 'video_generated',
            },
            {
              metadata: { imageId: 'mock-image-1' },
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              type: 'image_generated',
            },
          ],
          'activities',
          'mock-activity',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/stats')) {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          creditsUsed: 250,
          imagesGenerated: 156,
          storageUsed: 1024 * 1024 * 500, // 500MB
          videosGenerated: 42,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify({ data: {} }),
    contentType: 'application/json',
    status: 200,
  });
}

async function handlePromptRoutes(route: Route): Promise<void> {
  const method = route.request().method();

  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            id: 'mock-prompt-new',
            optimizedText:
              'A breathtaking cinematic sunset over a calm ocean, golden hour lighting',
            status: 'completed',
            text: 'A beautiful sunset over the ocean',
          },
          'prompts',
          'mock-prompt-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [
          { id: 'prompt-1', status: 'completed', text: 'Test prompt 1' },
          { id: 'prompt-2', status: 'completed', text: 'Test prompt 2' },
        ],
        'prompts',
        'mock-prompt',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleTrainingRoutes(route: Route): Promise<void> {
  const method = route.request().method();

  // Training creation - CRITICAL: Never start real training
  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            estimatedTime: 300,
            id: 'mock-training-new',
            progress: 0,
            status: 'queued',
          },
          'trainings',
          'mock-training-new',
        ),
      ),
      contentType: 'application/json',
      status: 201,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [
          {
            id: 'training-1',
            modelUrl: 'https://cdn.genfeed.ai/models/mock-model.safetensors',
            progress: 100,
            status: 'completed',
          },
        ],
        'trainings',
        'mock-training',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleSettingsRoutes(route: Route): Promise<void> {
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
    body: JSON.stringify(
      wrapInJsonApi(
        {
          language: 'en',
          notifications: true,
          theme: 'dark',
          timezone: 'UTC',
        },
        'settings',
        'mock-settings',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

// ----------------------------------------------------------------------------
// Main API Mock Setup
// ----------------------------------------------------------------------------

/**
 * Sets up comprehensive API mocking for E2E tests
 *
 * CRITICAL: This function MUST be called before any test that might trigger API calls.
 * It ensures that no real backend operations occur, preventing:
 * - AI generation (video, image, music, avatar)
 * - Billing operations (charges, subscription changes)
 * - External service calls (Stripe, ElevenLabs, HeyGen, etc.)
 *
 * @param page - Playwright Page instance
 * @param customMocks - Optional custom mock handlers to override defaults
 */
/**
 * Handles user/me endpoint — returns a fully-populated mock user.
 * isOnboardingCompleted: true prevents OnboardingGuard redirect.
 */
async function handleUserMeRoute(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(
      wrapInJsonApi(generateMockApiUser(), 'users', 'mock-user-id-e2e-test'),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleUserMeBrandsRoute(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi([generateMockBrand()], 'brands', 'mock-brand'),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleUserMeOrganizationsRoute(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi(
        [
          generateMockOrganization({
            id: 'mock-org-id-e2e-test',
            name: 'Test Organization',
            slug: 'test-org',
          }),
        ],
        'organizations',
        'mock-organization',
      ),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleBrandsRoute(route: Route): Promise<void> {
  const url = route.request().url();
  const method = route.request().method();
  const brand = {
    ...generateMockBrand(),
    handle: 'brand-1',
    primaryColor: '#111827',
  };

  if (method === 'GET' && /\/brands\/[^/?]+/.test(url)) {
    await route.fulfill({
      body: JSON.stringify(wrapInJsonApi(brand, 'brands', brand.id)),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (method === 'GET') {
    await route.fulfill({
      body: JSON.stringify(wrapCollectionInJsonApi([brand], 'brands', 'brand')),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(wrapInJsonApi(brand, 'brands', brand.id)),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleWorkspaceTasksRoute(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi([], 'workspace-task', 'workspace-task'),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

export async function setupApiMocks(
  page: Page,
  customMocks?: Record<string, (route: Route) => Promise<void>>,
): Promise<void> {
  // NOTE: Clerk endpoint mocking is handled in auth.fixture.ts setupClerkMocks()
  // which is registered AFTER this function so its handlers take priority.
  // Do NOT add Clerk routes here or they will override the fixture's detailed mocks.

  // The local dev API runs at http://local.genfeed.ai:3001/v1
  // Playwright globs don't handle ports well, so we use regex for the catch-all
  // and explicit URL patterns for specific resources.
  const LOCAL_API = 'http://local.genfeed.ai:3001';
  const PROD_API = '**/api.genfeed.ai';
  const PROD_API_V1 = '**/api.genfeed.ai/v1';

  const routeApi = async (
    pathPattern: string,
    handler: (route: Route) => Promise<void>,
  ): Promise<void> => {
    await page.route(`${PROD_API}${pathPattern}`, handler);
    await page.route(`${PROD_API_V1}${pathPattern}`, handler);
    await page.route(`${LOCAL_API}/v1${pathPattern}`, handler);
  };

  // Users — register the generic handler first because Playwright matches
  // routes in reverse registration order. More specific /users/me/* mocks
  // must be registered after the catch-all so they take precedence.
  await routeApi('/users/**', async (r) => {
    await handleUserMeRoute(r);
  });

  await routeApi('/users/me/brands**', async (r) => {
    await handleUserMeBrandsRoute(r);
  });

  await routeApi('/users/me/organizations**', async (r) => {
    await handleUserMeOrganizationsRoute(r);
  });

  await routeApi('/brands**', async (r) => {
    await handleBrandsRoute(r);
  });

  await routeApi('/workspace-tasks**', async (r) => {
    await handleWorkspaceTasksRoute(r);
  });

  // Agent panel chrome requests made from the protected layout.
  await routeApi('/threads**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi([], 'threads', 'mock-thread'),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/runs/active**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(wrapCollectionInJsonApi([], 'runs', 'mock-run')),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/credentials/mentions**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ mentions: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/agent/credits**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ balance: 1000, modelCosts: {} }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/auth/bootstrap**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(buildProtectedAppBootstrapPayload()),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/brands/*/activities**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi([], 'activities', 'mock-brand-activity'),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Core resource routes (prod api.genfeed.ai + local dev)
  await routeApi('/videos/**', handleVideoRoutes);

  await routeApi('/images/**', handleImageRoutes);

  await routeApi('/musics/**', handleMusicRoutes);

  await routeApi('/avatars/**', handleAvatarRoutes);

  await routeApi('/prompts/**', handlePromptRoutes);

  await routeApi('/trainings/**', handleTrainingRoutes);

  await routeApi('/organizations/**', handleOrganizationRoutes);

  await routeApi('/billing/**', handleBillingRoutes);

  await routeApi('/subscriptions/**', handleBillingRoutes);

  await routeApi('/credits/**', handleBillingRoutes);

  await routeApi('/payments/**', handleBillingRoutes);

  await routeApi('/analytics/**', handleAnalyticsRoutes);

  await routeApi('/activities/**', handleAnalyticsRoutes);

  await routeApi('/settings/**', handleSettingsRoutes);

  await page.route(/api\.genfeed\.ai\/v1\/health(?:\?.*)?$/, async (r) => {
    await r.fulfill({
      body: JSON.stringify({ status: 'ok' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Catch-all for unmocked local dev API calls (health checks, etc.)
  // Only matches /v1/health and unknown endpoints — specific routes above take priority.
  // NOTE: Playwright evaluates routes in reverse registration order, so this catch-all
  // must be registered FIRST (before specific routes) to have lowest priority.
  // Since it's registered last here, we restrict it to non-resource paths only.
  await page.route(/local\.genfeed\.ai:3001\/v1\/health/, async (r) => {
    await r.fulfill({
      body: JSON.stringify({ status: 'ok' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Support the production host when callers include the explicit /v1 prefix.
  // Many app services build URLs from NEXT_PUBLIC_API_ENDPOINT, which already
  // contains /v1 in local/e2e mode.
  await page.route('**/api.genfeed.ai/v1/**', async (r) => {
    const url = r.request().url();

    if (url.includes('/v1/health')) {
      await r.fulfill({
        body: JSON.stringify({ status: 'ok' }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/users/me/brands')) {
      await handleUserMeBrandsRoute(r);
      return;
    }

    if (url.includes('/v1/users/me/organizations')) {
      await handleUserMeOrganizationsRoute(r);
      return;
    }

    if (url.includes('/v1/brands')) {
      await handleBrandsRoute(r);
      return;
    }

    if (url.includes('/v1/workspace-tasks')) {
      await handleWorkspaceTasksRoute(r);
      return;
    }

    if (url.includes('/v1/users/')) {
      await handleUserMeRoute(r);
      return;
    }

    if (url.includes('/v1/threads')) {
      await r.fulfill({
        body: JSON.stringify(
          wrapCollectionInJsonApi([], 'threads', 'mock-thread'),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/runs/active')) {
      await r.fulfill({
        body: JSON.stringify(wrapCollectionInJsonApi([], 'runs', 'mock-run')),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/credentials/mentions')) {
      await r.fulfill({
        body: JSON.stringify({ mentions: [] }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/agent/credits')) {
      await r.fulfill({
        body: JSON.stringify({ balance: 1000, modelCosts: {} }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/auth/bootstrap')) {
      await r.fulfill({
        body: JSON.stringify(buildProtectedAppBootstrapPayload()),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/brands/') && url.includes('/activities')) {
      await r.fulfill({
        body: JSON.stringify(
          wrapCollectionInJsonApi([], 'activities', 'mock-brand-activity'),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (url.includes('/v1/videos/')) {
      await handleVideoRoutes(r);
      return;
    }

    if (url.includes('/v1/images/')) {
      await handleImageRoutes(r);
      return;
    }

    if (url.includes('/v1/musics/')) {
      await handleMusicRoutes(r);
      return;
    }

    if (url.includes('/v1/avatars/')) {
      await handleAvatarRoutes(r);
      return;
    }

    if (url.includes('/v1/prompts/')) {
      await handlePromptRoutes(r);
      return;
    }

    if (url.includes('/v1/trainings/')) {
      await handleTrainingRoutes(r);
      return;
    }

    if (url.includes('/v1/organizations/')) {
      await handleOrganizationRoutes(r);
      return;
    }

    if (
      url.includes('/v1/billing/') ||
      url.includes('/v1/subscriptions/') ||
      url.includes('/v1/credits/') ||
      url.includes('/v1/payments/')
    ) {
      await handleBillingRoutes(r);
      return;
    }

    if (url.includes('/v1/analytics/') || url.includes('/v1/activities/')) {
      await handleAnalyticsRoutes(r);
      return;
    }

    if (url.includes('/v1/settings/')) {
      await handleSettingsRoutes(r);
      return;
    }

    await r.fulfill({
      body: JSON.stringify({ mock: true, unhandledV1Route: url }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // External services — CRITICAL: never call real APIs
  await page.route('**/api.stripe.com/**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ mock: true, success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/api.elevenlabs.io/**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ mock: true, success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route('**/api.heygen.com/**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ mock: true, success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Apply custom mocks if provided
  if (customMocks) {
    for (const [pattern, handler] of Object.entries(customMocks)) {
      await page.route(pattern, handler);
    }
  }
}

/**
 * Sets up mock for a specific API endpoint
 *
 * @param page - Playwright Page instance
 * @param urlPattern - URL pattern to match (glob syntax)
 * @param response - Response body to return
 * @param options - Additional response options
 */
export async function mockApiEndpoint(
  page: Page,
  urlPattern: string,
  response: unknown,
  options: {
    status?: number;
    contentType?: string;
    delay?: number;
  } = {},
): Promise<void> {
  const { status = 200, contentType = 'application/json', delay = 0 } = options;

  await page.route(urlPattern, async (route) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    await route.fulfill({
      body: typeof response === 'string' ? response : JSON.stringify(response),
      contentType,
      status,
    });
  });
}

/**
 * Mocks an API endpoint to return an error
 *
 * @param page - Playwright Page instance
 * @param urlPattern - URL pattern to match
 * @param errorCode - HTTP status code
 * @param errorMessage - Error message
 */
export async function mockApiError(
  page: Page,
  urlPattern: string,
  errorCode: number,
  errorMessage: string,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            detail: errorMessage,
            status: errorCode.toString(),
            title: errorMessage,
          },
        ],
      }),
      contentType: 'application/json',
      status: errorCode,
    });
  });
}

/**
 * Mocks WebSocket connections (for real-time updates)
 *
 * Note: Playwright has limited WebSocket support, this provides basic mocking
 */
export async function mockWebSocket(page: Page): Promise<void> {
  // Intercept WebSocket upgrade requests
  await page.route('**/notifications.genfeed.ai/**', async (route) => {
    // For HTTP requests to the WebSocket endpoint
    await route.fulfill({
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
      },
      status: 101,
    });
  });
}
