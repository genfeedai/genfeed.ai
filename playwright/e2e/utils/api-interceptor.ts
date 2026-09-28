import {
  ActivityKey,
  AnalyticsMetric,
  AnalyticsMetricAvailability,
  BrandInterviewStatus,
  type IngredientCategory,
  Platform,
} from '@genfeedai/contracts';
import { EXPERT_FIRST_SYSTEM_CREDIT_COST } from '@genfeedai/contracts/constants';
import type {
  AdsResearchResponse,
  AdWatchlistPlatformReadiness,
  IAccountAnalytics,
  IAccountAnalyticsDetail,
  IAccountAnalyticsList,
  IAgentBrandContextSnapshot,
  IBrandInterviewStartResult,
  IBrandMemoryInsight,
  IByokProviderStatus,
  ICostReportSummary,
  IEmailPerformanceReport,
  IExpertPathStatus,
  ITrendHashtag,
  ITrendSound,
  IUnitEconomicsReport,
  OrganizationCreditUsageResponse,
  SocialSourcesResponse,
} from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import {
  createPlaywrightApiRoutePattern,
  playwrightApiEndpoint,
} from '../config/environment';

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
  /** Set when a spec needs an account-type-specific surface (Expert Path). */
  accountType?: string;
}

interface MockIngredient {
  id: string;
  type: string;
  category: IngredientCategory;
  status: string;
  url: string;
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
  isFleetEnabled: boolean;
  organizationId: string;
  organization: MockOrganization;
}

interface MockOrganizationSettings {
  id: string;
  isAdvancedMode: boolean;
  isFleetNsfwVisible: boolean;
  defaultAvatarIngredientId: string | null;
  defaultVoiceId: string | null;
  defaultVoiceRef: {
    provider: string;
    voiceId: string;
  } | null;
}

interface MockFleetCapabilities {
  isByokEnabled: boolean;
  isFleetAvailable: boolean;
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
    authProviderId: 'mock-user-id-e2e-test',
    createdAt: new Date().toISOString(),
    email: 'test@genfeed.ai',
    firstName: 'Test',
    handle: 'testuser',
    id: 'mock-user-id-e2e-test',
    isOnboardingCompleted: true,
    lastName: 'User',
    onboardingCompletedAt: new Date(Date.now() - 86400000).toISOString(),
    onboardingStepsCompleted: ['profile', 'organization', 'subscription'],
    onboardingType: 'CREATOR',
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
    isFleetEnabled: false,
    label: 'Brand 1',
    links: [],
    name: 'Brand 1',
    // The real IBrand contract always nests a full organization relation
    // (packages/contracts/src/interfaces/organization/brand.interface.ts). Without it,
    // getBrandOrganizationSlug() in brand-context.helpers.ts can never resolve
    // a slug, which permanently fails any page's org/brand scope-match guard
    // (nightly full tier, #2982).
    organization: generateMockOrganization({
      id: 'mock-org-id-e2e-test',
      name: 'Test Organization',
      slug: 'test-org',
    }),
    organizationId: 'mock-org-id-e2e-test',
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
    isFleetNsfwVisible: false,
    ...overrides,
  };
}

export function generateMockFleetCapabilities(
  overrides: Partial<MockFleetCapabilities> = {},
): MockFleetCapabilities {
  return {
    isByokEnabled: false,
    isFleetAvailable: false,
    ...overrides,
  };
}

export function generateMockIngredient(
  type: string,
  overrides: Partial<MockIngredient> = {},
): MockIngredient {
  const baseId = `mock-${type}-${Date.now()}`;
  return {
    category: type.toUpperCase() as IngredientCategory,
    createdAt: new Date().toISOString(),
    id: baseId,
    status: 'completed',
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

export function buildEmptyElementsAggregatePayload() {
  const emptyCollection = (type: string) =>
    wrapCollectionInJsonApi([], type, type);

  return {
    data: {
      blacklists: emptyCollection('element-blacklists'),
      cameraMovements: emptyCollection('element-camera-movements'),
      cameras: emptyCollection('element-cameras'),
      lenses: emptyCollection('element-lenses'),
      lightings: emptyCollection('element-lightings'),
      moods: emptyCollection('element-moods'),
      scenes: emptyCollection('element-scenes'),
      sounds: emptyCollection('element-sounds'),
      styles: emptyCollection('element-styles'),
    },
  };
}

export function buildProtectedAppBootstrapPayload() {
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
    brands: [generateMockBrand()],
    currentUser: generateMockApiUser(),
    fleetCapabilities: generateMockFleetCapabilities(),
    settings: generateMockOrganizationSettings(),
    streak: null,
  };
}

function buildInstallReadinessPayload() {
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

function buildProactiveWorkspacePayload() {
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

function buildAnalyticsSummary() {
  return {
    avgEngagementRate: 4.2,
    clicks: 128,
    comments: 18,
    engagementRate: 4.2,
    engagements: 420,
    followers: 2400,
    impressions: 12_400,
    likes: 240,
    posts: 12,
    reach: 9_800,
    shares: 36,
    views: 18_200,
  };
}

function buildTimeSeriesPoints() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    return {
      date,
      engagementRate: 3.5 + index * 0.1,
      engagements: 80 + index * 8,
      impressions: 1_000 + index * 120,
      platform: 'tiktok',
      posts: 1 + (index % 2),
      reach: 800 + index * 95,
      views: 1_500 + index * 150,
    };
  });
}

function buildMockTrend(overrides: Record<string, unknown> = {}) {
  return {
    category: 'creator_tools',
    createdAt: new Date().toISOString(),
    description: 'A reusable creative pattern for short-form content.',
    hashtags: ['#genfeed', '#creator'],
    id: 'mock-id',
    platform: 'tiktok',
    score: 82,
    status: 'active',
    title: 'Fast workflow demos',
    updatedAt: new Date().toISOString(),
    viralityScore: 82,
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Route Handlers
// ----------------------------------------------------------------------------

function isCollectionResourceRequest(url: string, resource: string): boolean {
  try {
    const { pathname } = new URL(url);
    return pathname === `/v1/${resource}` || pathname.endsWith(`/${resource}`);
  } catch {
    return false;
  }
}

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

  // Membership list: GET /organizations?mine=true (legacy /mine removed).
  if (
    url.includes('mine=true') ||
    url.endsWith('/mine') ||
    url.includes('/mine?')
  ) {
    // Bespoke projection (not JSON:API). OrganizationsService.getMyOrganizations
    // reads res.data as MyOrganizationSummary[] — a document-shaped fallback
    // makes `.filter` throw and the switcher shows "Failed to load organizations".
    await route.fulfill({
      body: JSON.stringify([
        {
          brand: { id: 'brand-1', label: 'Brand 1' },
          id: 'mock-org-id-e2e-test',
          isActive: true,
          isOwner: true,
          label: 'Test Organization',
          slug: 'test-org',
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

  // Collection POST /organizations (preferred) and legacy /create seed shape.
  if (
    route.request().method() === 'POST' &&
    (url.endsWith('/organizations') ||
      url.endsWith('/organizations/') ||
      url.endsWith('/create'))
  ) {
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

  if (url.includes('/fleet-capabilities')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          generateMockFleetCapabilities(),
          'fleet-capabilities',
          'mock-fleet-capabilities',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // OrganizationsSettingsController.getByokAllProviders returns a raw array.
  if (/\/organizations\/[^/]+\/settings\/byok\/?(?:\?|$)/.test(url)) {
    const statuses: IByokProviderStatus[] = [];
    await route.fulfill({
      body: JSON.stringify(statuses),
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
  if (method === 'POST' && isCollectionResourceRequest(url, 'videos')) {
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
  if (method === 'POST' && isCollectionResourceRequest(url, 'images')) {
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

  // SubscriptionsController returns this admin list as plain JSON, not JSON:API.
  if (url.includes('/subscriptions/admin/credit-usage')) {
    const creditUsage: OrganizationCreditUsageResponse = {
      data: [],
      limit: 20,
      page: 1,
      success: true,
      totalDocs: 0,
      totalPages: 0,
    };
    await route.fulfill({
      body: JSON.stringify(creditUsage),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

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

  if (url.includes('/topbar-balances')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          {
            generatedAt: new Date().toISOString(),
            segments: [
              {
                balance: 500,
                currencyOrUnit: 'credits',
                label: 'Genfeed',
                lastSyncedAt: new Date().toISOString(),
                provider: 'genfeed',
                status: 'available',
              },
            ],
          },
          'topbar-balances',
          'topbar-balances',
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
            available: 500,
            total: 625,
            used: 125,
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

function createMockAccountAnalytics(credentialId: string): IAccountAnalytics {
  return {
    coverage: 1,
    evaluation: null,
    freshnessHours: 2,
    identity: {
      brandId: 'brand-1',
      brandLabel: 'Brand 1',
      connectedAt: null,
      credentialId,
      externalAvatar: null,
      externalHandle: '@mock',
      externalId: null,
      externalName: 'Mock account',
      firstPublishedAt: null,
      firstTrackedAt: null,
      isConnected: true,
      label: 'Mock account',
      manageHref: '/settings/social',
      platform: Platform.TIKTOK,
    },
    metrics: [
      {
        availability: AnalyticsMetricAvailability.OBSERVED,
        change: 1200,
        lifetime: 18_200,
        metric: AnalyticsMetric.VIEWS,
      },
    ],
    publishedPosts: 12,
  };
}

async function handleAnalyticsRoutes(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.includes('/activities')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          [
            {
              createdAt: new Date().toISOString(),
              isRead: false,
              key: ActivityKey.VIDEO_GENERATED,
              source: 'video-generate',
              value: '',
            },
            {
              createdAt: new Date(Date.now() - 3600000).toISOString(),
              isRead: true,
              key: ActivityKey.IMAGE_GENERATED,
              source: 'image-generate',
              value: '',
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

  if (url.includes('/leaderboard') || url.includes('/top')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi([], 'analytics-leaderboard', 'leaderboard'),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  const { pathname } = new URL(url);

  if (pathname.endsWith('/analytics/brands')) {
    const brands = {
      data: [],
      pagination: { limit: 64, page: 1, total: 0, totalPages: 1 },
    };
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(brands, 'analytics-brand-stats', 'mock-brand-stats'),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  const accountDetailMatch = pathname.match(/\/analytics\/accounts\/([^/]+)$/);
  if (accountDetailMatch) {
    const credentialId = accountDetailMatch[1];
    const detail: IAccountAnalyticsDetail = {
      ...createMockAccountAnalytics(credentialId),
      growth: [],
      series: [],
      topPosts: [],
    };
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(detail, 'account-analytics-detail', credentialId),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (pathname.endsWith('/analytics/accounts')) {
    const list: IAccountAnalyticsList = {
      accounts: [createMockAccountAnalytics('mock-id')],
      limit: 50,
      page: 1,
      total: 1,
      totalPages: 1,
      unattributedPostCount: 0,
    };
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(list, 'account-analytics-list', 'mock-account-list'),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (pathname.endsWith('/analytics/business')) {
    const business = {
      comparisons: {
        cashInVsUsageValue: { cashIn: 0, usageValue: 0 },
        outstandingPrepaid: 0,
        soldVsConsumed: { consumed: 0, sold: 0 },
      },
      credits: {
        consumed: 0,
        dailyConsumedSeries: [],
        dailySoldSeries: [],
        sold: 0,
        wowGrowth: 0,
      },
      ingredients: {
        categoryBreakdown: [],
        dailySeries: [],
        last30d: 0,
        last7d: 0,
        today: 0,
        wowGrowth: 0,
      },
      leaders: { byCredits: [], byIngredients: [], byRevenue: [] },
      projections: {
        creditsNext30d: null,
        ingredientsNext30d: null,
        insufficientData: true,
        isEstimate: true,
        revenueNext30d: null,
      },
      revenue: {
        dailySeries: [],
        last30d: 0,
        last7d: 0,
        mtd: 0,
        today: 0,
        wowGrowth: 0,
      },
    };
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(
          business,
          'business-analytics',
          'mock-business-analytics',
        ),
      ),
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

  if (method === 'GET' && url.includes('/analytics/timeseries')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(
          buildTimeSeriesPoints(),
          'analytics-timeseries',
          'brand-timeseries',
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (method === 'GET' && url.includes('/analytics')) {
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(buildAnalyticsSummary(), 'analytics', 'brand-analytics'),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  const { pathname, searchParams } = new URL(url);

  if (method === 'GET' && /\/brands\/[^/]+\/agent-context\/?$/.test(pathname)) {
    const snapshot: IAgentBrandContextSnapshot = {
      brandId: brand.id,
      brandName: brand.name,
      budget: {
        capChars: 12_000,
        isTrimmed: false,
        trimmedSections: [],
        untrimmedChars: 0,
        usedChars: 0,
      },
      generatedAt: new Date().toISOString(),
      id: brand.id,
      layerStatus: [],
      layers: {
        identity: { name: brand.name },
        knowledge: [],
        patterns: [],
        performanceInsights: [],
        prompting: { conversationStarters: [], seeds: [] },
        recentPosts: [],
      },
      layersUsed: [],
      memories: [],
      memoryPrompt: '',
      model: { creditsPerRound: 1, key: 'mock-model' },
      query: searchParams.get('query') ?? '',
      skills: [],
      systemPrompt: '',
    };
    await route.fulfill({
      body: JSON.stringify(
        wrapInJsonApi(snapshot, 'agent-brand-context', brand.id),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (
    method === 'GET' &&
    /\/brands\/[^/]+\/memory\/insights\/?$/.test(pathname)
  ) {
    const insights: IBrandMemoryInsight[] = [];
    await route.fulfill({
      body: JSON.stringify(
        wrapCollectionInJsonApi(insights, 'brand-memory-insight', 'insight'),
      ),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // ExpertPathController returns raw bodies, not JSON:API.
  if (
    method === 'GET' &&
    /\/brands\/[^/]+\/expert-path\/first-system\/?$/.test(pathname)
  ) {
    await route.fulfill({
      body: JSON.stringify({ items: null, plan: null }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (method === 'GET' && /\/brands\/[^/]+\/expert-path\/?$/.test(pathname)) {
    const status: IExpertPathStatus = {
      brandId: brand.id,
      corpus: { isComplete: false, readySourceCount: 0, sourceCount: 0 },
      firstSystem: {
        readiness: {
          creditCost: EXPERT_FIRST_SYSTEM_CREDIT_COST,
          isReady: false,
          isUsingInterviewPlatforms: false,
          missing: ['positioning', 'corpus'],
          platforms: [],
        },
        status: 'none',
      },
      isExpert: false,
      positioning: { answeredCount: 0, isComplete: false, totalCount: 0 },
      publishApproval: { isRequired: true },
    };
    await route.fulfill({
      body: JSON.stringify(status),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  // BrandInterviewController returns raw bodies, not JSON:API.
  if (
    method === 'GET' &&
    /\/brands\/[^/]+\/interview\/active\/?$/.test(pathname)
  ) {
    await route.fulfill({
      body: 'null',
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (method === 'POST' && /\/brands\/[^/]+\/interview\/?$/.test(pathname)) {
    const started: IBrandInterviewStartResult = {
      answeredFields: {},
      brandId: brand.id,
      completenessScore: 0,
      creditsCharged: 0,
      currentQuestion: null,
      interviewId: 'mock-interview-id',
      isExpertPositioning: true,
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 0 },
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
    };
    await route.fulfill({
      body: JSON.stringify(started),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

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

async function handleTasksRoute(route: Route): Promise<void> {
  const request = route.request();
  const { pathname } = new URL(request.url());

  // A single task the spec did not mock does not exist: the real controller
  // answers 404 to reads and updates, which the detail page renders as
  // "not found".
  if (
    ['GET', 'PATCH'].includes(request.method()) &&
    /\/tasks\/(?:by-identifier\/)?[^/]+\/?$/.test(pathname)
  ) {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          { detail: 'Task not found', status: '404', title: 'Not Found' },
        ],
      }),
      contentType: 'application/json',
      status: 404,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(wrapCollectionInJsonApi([], 'task', 'task')),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleNewslettersRoute(route: Route): Promise<void> {
  const request = route.request();
  const { pathname } = new URL(request.url());

  // NewslettersController.findOne and /context use findOneScoped: an
  // unmocked id is a 404, which the editor renders as "not found".
  if (
    request.method() === 'GET' &&
    /\/newsletters\/[^/]+(?:\/context)?\/?$/.test(pathname)
  ) {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          { detail: 'Newsletter not found', status: '404', title: 'Not Found' },
        ],
      }),
      contentType: 'application/json',
      status: 404,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(buildUnhandledApiMockBody(request.url())),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleTemplatesRoute(route: Route): Promise<void> {
  const request = route.request();
  const { pathname } = new URL(request.url());

  // TemplatesController.findOne uses findOrThrow: an unmocked id is a 404,
  // which the detail page handles by returning to the list.
  if (request.method() === 'GET' && /\/templates\/[^/]+\/?$/.test(pathname)) {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          { detail: 'Template not found', status: '404', title: 'Not Found' },
        ],
      }),
      contentType: 'application/json',
      status: 404,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(wrapCollectionInJsonApi([], 'templates', 'template')),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleOnboardingRoute(route: Route): Promise<void> {
  const url = route.request().url();

  if (url.includes('/install-readiness')) {
    await route.fulfill({
      body: JSON.stringify(buildInstallReadinessPayload()),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (
    url.includes('/proactive-workspace') ||
    url.includes('/proactive-claim')
  ) {
    await route.fulfill({
      body: JSON.stringify(buildProactiveWorkspacePayload()),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (
    url.includes('/complete-funnel') ||
    url.includes('/account-type') ||
    url.includes('/brand-setup') ||
    url.includes('/brand-name') ||
    url.includes('/skip')
  ) {
    await route.fulfill({
      body: JSON.stringify({ message: 'ok', success: true }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify({ message: 'ok', success: true }),
    contentType: 'application/json',
    status: 200,
  });
}

async function handleTrendsRoute(route: Route): Promise<void> {
  const url = route.request().url();
  const method = route.request().method();

  if (method === 'POST') {
    await route.fulfill({
      body: JSON.stringify({ count: 1, message: 'refreshed', success: true }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/discovery')) {
    await route.fulfill({
      body: JSON.stringify({
        summary: {
          connectedPlatforms: ['tiktok'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: [buildMockTrend()],
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/content')) {
    const content = {
      items: [
        {
          contentRank: 1,
          contentType: 'video',
          id: 'trend-content-1',
          matchedTrends: ['workflow'],
          mediaUrl: 'https://cdn.genfeed.ai/mock/trends/demo.mp4',
          platform: Platform.TIKTOK,
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://example.com/trend-content-1',
          title: 'Workflow demo clip',
          trendId: 'mock-id',
          trendMentions: 1200,
          trendTopic: 'workflow',
          trendViralityScore: 88,
        },
      ],
      summary: {
        connectedPlatforms: [Platform.TIKTOK],
        lockedPlatforms: [],
        totalItems: 1,
        totalTrends: 1,
      },
    };
    await route.fulfill({
      body: JSON.stringify(content),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/turnover')) {
    await route.fulfill({
      body: JSON.stringify({
        byPlatform: [
          {
            alive: 8,
            appeared: 4,
            avgLifespanDays: 12,
            died: 1,
            platform: 'tiktok',
            turnoverRate: 0.2,
          },
        ],
        days: 30,
        timeline: buildTimeSeriesPoints().map((point) => ({
          appeared: 1,
          date: point.date,
          died: 0,
        })),
        totals: {
          alive: 8,
          appeared: 4,
          avgLifespanDays: 12,
          died: 1,
          turnoverRate: 0.2,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/videos')) {
    await route.fulfill({
      body: JSON.stringify({
        videos: [
          {
            id: 'trend-video-1',
            platform: 'tiktok',
            title: 'Workflow demo',
            viralScore: 88,
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/leaderboard')) {
    await route.fulfill({
      body: JSON.stringify({ leaderboard: [buildMockTrend()] }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/hashtags')) {
    const hashtags: ITrendHashtag[] = [
      {
        growthRate: 12,
        hashtag: 'genfeed',
        id: 'hashtag-1',
        platform: Platform.TIKTOK,
        postCount: 1200,
        relatedHashtags: [],
        viewCount: 54_000,
        viralityScore: 82,
      },
    ];
    await route.fulfill({
      body: JSON.stringify({
        hashtags,
        summary: {
          avgViralityScore: 82,
          platforms: [Platform.TIKTOK],
          totalHashtags: 1,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/sounds')) {
    const sounds: ITrendSound[] = [
      {
        growthRate: 8,
        id: 'sound-1',
        platform: Platform.TIKTOK,
        soundId: 'sound-1',
        soundName: 'Demo sound',
        usageCount: 1200,
        viralityScore: 70,
      },
    ];
    await route.fulfill({
      body: JSON.stringify({
        sounds,
        summary: { avgViralityScore: 70, totalSounds: 1, totalUsage: 1200 },
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.includes('/trends/corpus/health')) {
    const health = {
      generatedAt: new Date().toISOString(),
      providerFailures: [],
      segments: [],
      status: 'empty',
      summary: {
        activeTrends: 1,
        failingProviders: 0,
        freshSegments: 0,
        platforms: [Platform.TIKTOK],
        referenceRecords: 0,
        staleSegments: 0,
        totalSegments: 0,
      },
    };
    await route.fulfill({
      body: JSON.stringify(health),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.match(/\/trends\/[^/?]+\/sources/)) {
    await route.fulfill({
      body: JSON.stringify({
        items: [
          {
            id: 'source-1',
            platform: 'tiktok',
            title: 'Source clip',
            url: 'https://example.com/source',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  if (url.match(/\/trends\/[^/?]+/)) {
    await route.fulfill({
      body: JSON.stringify({
        content: {
          examples: [],
          hooks: ['Show the before, then the workflow'],
        },
        related: [],
        sources: [],
        trend: buildMockTrend(),
      }),
      contentType: 'application/json',
      status: 200,
    });
    return;
  }

  await route.fulfill({
    body: JSON.stringify(
      wrapCollectionInJsonApi([buildMockTrend()], 'trends', 'trend'),
    ),
    contentType: 'application/json',
    status: 200,
  });
}

function normalizeCostReportBoundary(value: string, endOfDay: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  return new Date(value);
}

/**
 * Catch-all body for unmocked API URLs.
 *
 * Most collection endpoints are JSON:API `{ data: [] }`. A few production
 * routes return a bare array; wrapping those as a document makes the client
 * call `.map` on an object and the page never paints.
 */
export function buildUnhandledApiMockBody(url: string): unknown {
  const parsedUrl = new URL(url, 'http://localhost');
  if (
    parsedUrl.pathname === '/v1/costs/summary' ||
    parsedUrl.pathname === '/costs/summary'
  ) {
    const requestedTo = parsedUrl.searchParams.get('to');
    const requestedFrom = parsedUrl.searchParams.get('from');
    const to = requestedTo
      ? normalizeCostReportBoundary(requestedTo, true)
      : new Date();
    const from = requestedFrom
      ? normalizeCostReportBoundary(requestedFrom, false)
      : new Date(to.getTime() - 30 * 86_400_000);
    const summary: ICostReportSummary = {
      byBrand: [],
      daily: [],
      from: from.toISOString(),
      to: to.toISOString(),
      total: {
        byokCount: 0,
        creditsUsed: 0,
        generationCount: 0,
        llmCount: 0,
        mediaCount: 0,
        providerCostMicros: 0,
        providerCostUsd: 0,
      },
    };
    return wrapInJsonApi(summary, 'cost-report-summary', 'mock-cost-summary');
  }

  if (url.includes('/v1/health') || /\/health(?:\?|$)/.test(url)) {
    return { status: 'ok' };
  }

  if (url.includes('/system/db-mode')) {
    return { mode: 'development' };
  }

  if (
    /\/agent\/threads\/[^/?]+\/work-objects(?:\/[^/?]+\/actions)?(?:\?|$)/.test(
      url,
    )
  ) {
    return { workObjects: [], sessionAssets: [] };
  }

  if (url.includes('/mentions')) {
    return { mentions: [] };
  }

  // CredentialsPublishingController returns these as raw arrays, not JSON:API.
  if (
    url.includes('/account-health') ||
    url.includes('/publishing-readiness')
  ) {
    return [];
  }

  const { pathname, searchParams } = parsedUrl;

  // SystemEmailsController.list and OutreachCampaignTargetsController return
  // raw arrays, not JSON:API.
  if (
    /\/admin\/system-emails\/?$/.test(pathname) ||
    /\/outreach-campaigns\/[^/]+\/targets\/?$/.test(pathname)
  ) {
    return [];
  }

  if (/\/admin\/system-emails\/performance\/?$/.test(pathname)) {
    const now = new Date().toISOString();
    const report: Omit<IEmailPerformanceReport, 'id'> = {
      asOf: now,
      from: searchParams.get('from') ?? now,
      rows: [],
      to: searchParams.get('to') ?? now,
    };
    return wrapInJsonApi(report, 'email-performance', 'mock-email-performance');
  }

  if (/\/admin\/unit-economics\/?$/.test(pathname)) {
    const now = new Date().toISOString();
    const report: IUnitEconomicsReport = {
      from: searchParams.get('from') ?? now,
      organizationId: searchParams.get('organizationId'),
      organizationLabel: null,
      rows: [],
      to: searchParams.get('to') ?? now,
      totals: {
        agentChatCredits: 0,
        agentTurns: 0,
        generationCredits: 0,
        grossMarginPercent: null,
        grossMarginUsd: 0,
        llmProviderCostUsd: 0,
        mediaProviderCostUsd: 0,
        revenueUsd: 0,
      },
    };
    return wrapInJsonApi(
      report,
      'unit-economics-report',
      'mock-unit-economics',
    );
  }

  // SocialSourcesController.getFeed returns its result raw, not JSON:API.
  if (/\/social-sources\/feed\/?$/.test(pathname)) {
    const feed: SocialSourcesResponse = {
      posts: [],
      sources: [],
      summary: { activeSources: 0, totalPosts: 0, totalSources: 0 },
    };
    return feed;
  }

  // AdsResearchController returns raw bodies, not JSON:API.
  if (/\/ads\/research\/?$/.test(pathname)) {
    const research: AdsResearchResponse = {
      connectedAds: [],
      filters: {},
      publicAds: [],
      summary: {
        connectedCount: 0,
        publicCount: 0,
        reviewPolicy: 'Review required.',
        selectedPlatform: 'all',
        selectedSource: 'all',
      },
    };
    return research;
  }

  if (/\/ads\/research\/watchlist-readiness\/?$/.test(pathname)) {
    const readiness: AdWatchlistPlatformReadiness[] = [];
    return readiness;
  }

  return { data: [], meta: { totalCount: 0 } };
}

export async function registerProtectedAppHostFallbacks(
  page: Page,
): Promise<void> {
  await page.route(/\/v1\/organizations(?:\?|$|\/)/, handleOrganizationRoutes);
  await page.route(/\/v1\/auth\/bootstrap/, async (r) => {
    await r.fulfill({
      body: JSON.stringify(buildProtectedAppBootstrapPayload()),
      contentType: 'application/json',
      status: 200,
    });
  });
}

export async function setupApiMocks(
  page: Page,
  customMocks?: Record<string, (route: Route) => Promise<void>>,
): Promise<void> {
  // NOTE: Better Auth endpoint mocking is handled in auth.fixture.ts setupBetterAuthMocks()
  // which is registered AFTER this function so its handlers take priority.
  // Do NOT add Better Auth routes here or they will override the fixture's detailed mocks.

  // Playwright globs don't handle ports well, so derive the catch-all regex and
  // explicit resource URLs from the configured local API endpoint.
  const PROD_API = '**/api.genfeed.ai';
  const PROD_API_V1 = '**/api.genfeed.ai/v1';

  // Register broad fallbacks FIRST so later specific mocks win. Nightly E2E
  // builds bake NEXT_PUBLIC_API_ENDPOINT=https://api.genfeed.ai/v1 — the
  // production-host catch-all must sit below routeApi() or it shadows every
  // resource handler and pages deserialize the wrong JSON:API shape.
  const fallbackCollectionHandler = async (r: Route): Promise<void> => {
    await r.fulfill({
      body: JSON.stringify(buildUnhandledApiMockBody(r.request().url())),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route(
    createPlaywrightApiRoutePattern(),
    fallbackCollectionHandler,
  );
  await page.route('**/api.genfeed.ai/v1/**', fallbackCollectionHandler);
  await page.route('**/api.genfeed.ai/**', fallbackCollectionHandler);

  const routeApi = async (
    pathPattern: string,
    handler: (route: Route) => Promise<void>,
  ): Promise<void> => {
    await page.route(`${PROD_API}${pathPattern}`, handler);
    await page.route(`${PROD_API_V1}${pathPattern}`, handler);
    await page.route(`${playwrightApiEndpoint}${pathPattern}`, handler);
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

  await routeApi('/tasks**', async (r) => {
    await handleTasksRoute(r);
  });

  await routeApi('/templates**', async (r) => {
    await handleTemplatesRoute(r);
  });

  await routeApi('/newsletters/**', async (r) => {
    await handleNewslettersRoute(r);
  });

  await routeApi('/onboarding/**', async (r) => {
    await handleOnboardingRoute(r);
  });

  await routeApi('/trends**', async (r) => {
    await handleTrendsRoute(r);
  });

  await page.route('**/api/creative-patterns**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { page: 1, pageSize: 0, totalCount: 0 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/services/*/verify**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ success: true }),
      contentType: 'application/json',
      status: 200,
    });
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

  await routeApi('/credentials/brand/**/account-health**', async (r) => {
    await r.fulfill({
      body: JSON.stringify([]),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/credentials/brand/**/publishing-readiness**', async (r) => {
    await r.fulfill({
      body: JSON.stringify([]),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/agent/credits**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ balance: 500, modelCosts: {} }),
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
  await routeApi('/elements**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(buildEmptyElementsAggregatePayload()),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApi('/videos/**', handleVideoRoutes);

  await routeApi('/images/**', handleImageRoutes);

  // Collection-root `GET /musics?...` does not match `/musics/**`.
  await routeApi('/musics**', handleMusicRoutes);

  await routeApi('/avatars/**', handleAvatarRoutes);

  await routeApi('/prompts/**', handlePromptRoutes);

  await routeApi('/trainings/**', handleTrainingRoutes);

  await routeApi('/folders**', async (r) => {
    await r.fulfill({
      body: JSON.stringify(wrapCollectionInJsonApi([], 'folders', 'folder')),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Collection roots (`/organizations?mine=true`, `/credits`) do not match
  // `/resource/**`. Use `/resource**` so the query-string and bare-list
  // requests hit the same handlers as nested paths.
  await routeApi('/organizations**', handleOrganizationRoutes);

  await routeApi('/billing**', handleBillingRoutes);

  await routeApi('/subscriptions**', handleBillingRoutes);

  await routeApi('/credits**', handleBillingRoutes);

  await routeApi('/payments**', handleBillingRoutes);

  await routeApi('/analytics/**', handleAnalyticsRoutes);

  await routeApi('/activities/**', handleAnalyticsRoutes);

  await routeApi('/settings/**', handleSettingsRoutes);

  await routeApi('/system/db-mode**', async (r) => {
    await r.fulfill({
      body: JSON.stringify({ mode: 'development' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Glob `**` is path-segment based and can miss `?mine=true` / bootstrap
  // query URLs. Register regex last so they beat both the glob mocks and the
  // network-guard `**/*` abort of api.genfeed.ai.
  await registerProtectedAppHostFallbacks(page);

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
  await page.route(/local\.genfeed\.ai:3010\/v1\/health/, async (r) => {
    await r.fulfill({
      body: JSON.stringify({ status: 'ok' }),
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
  await page.route('**/api.argil.ai/**', async (r) => {
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
