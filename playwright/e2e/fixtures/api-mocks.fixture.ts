import {
  ActivityKey,
  AgentThreadMode,
  type CredentialPlatform,
  FleetReviewStatus,
  IngredientCategory,
  IngredientStatus,
  LibraryShelf,
  PostCategory,
  PostStatus,
  PostVisibility,
  QualityStatus,
  ReleaseTargetSource,
  SocialSourceType,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  type TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import { buildReleaseAnalyticsComparison } from '@genfeedai/contracts/api-types/contracts/scheduler-analytics-comparison.contract';
import type {
  AdsResearchFilters,
  AdsResearchItem,
  AdsResearchResponse,
  IChannelTarget,
  ILibrarySummary,
  ISocialSource,
  ISourcePost,
  SocialSourcesResponse,
} from '@genfeedai/contracts/interfaces';
import { AdsChannel, AdsPlatform } from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import {
  playwrightApiEndpoint,
  playwrightApiOrigin,
} from '../config/environment';
import {
  buildProtectedAppBootstrapPayload,
  generateMockIngredient,
  generateMockOrganization,
  generateMockSubscription,
  generateMockUser,
} from '../utils/api-interceptor';

/**
 * API Mock Fixtures for Playwright E2E Tests
 *
 * Provides specialized mock fixtures for different testing scenarios.
 * All mocks prevent real backend calls - especially AI generation.
 *
 * @module api-mocks.fixture
 */

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

interface MockOptions {
  delay?: number;
  status?: number;
}

interface GenerationMockOptions extends MockOptions {
  progress?: number;
  finalStatus?: 'completed' | 'failed' | 'cancelled';
}

interface BillingMockOptions extends MockOptions {
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  credits?: number;
  hasPaymentMethod?: boolean;
}

interface MockAvatarIdentityFixture {
  id: string;
  label: string;
  extension: 'jpg' | 'jpeg' | 'mp4';
  ingredientUrl: string;
  thumbnailUrl: string;
  parent?: string;
}

const LOCAL_API = playwrightApiEndpoint;

function buildAvatarIdentityFixture(
  overrides: Partial<MockAvatarIdentityFixture>,
): MockAvatarIdentityFixture {
  const id = overrides.id ?? `avatar-${Date.now()}`;
  const extension = overrides.extension ?? 'jpg';
  const isVideo = extension === 'mp4';

  return {
    extension,
    id,
    ingredientUrl:
      overrides.ingredientUrl ??
      `https://cdn.genfeed.ai/mock/avatars/${id}.${extension}`,
    label: overrides.label ?? `Avatar ${id}`,
    parent: overrides.parent,
    thumbnailUrl:
      overrides.thumbnailUrl ??
      `https://cdn.genfeed.ai/mock/avatars/${id}-thumb.${isVideo ? 'jpg' : extension}`,
  };
}

function avatarMetadataId(avatar: MockAvatarIdentityFixture): string {
  return `${avatar.id}-metadata`;
}

// IngredientSerializer emits metadata as relationship linkage plus an
// `included` resource, not as an embedded attribute.
function buildAvatarMetadataResource(avatar: MockAvatarIdentityFixture) {
  return {
    attributes: {
      description: `${avatar.label} fixture`,
      extension: avatar.extension,
      label: avatar.label,
    },
    id: avatarMetadataId(avatar),
    type: 'metadata',
  };
}

function buildAvatarIngredientDocument(avatar: MockAvatarIdentityFixture) {
  return {
    attributes: {
      // IngredientCategory.AVATAR is 'AVATAR' (uppercase) — isAvatarIngredient()
      // does a strict `category === IngredientCategory.AVATAR` check, so a
      // lowercase 'avatar' here silently drops every fixture avatar from
      // useAvatarImages()'s filtered list (#mock-shape).
      category: IngredientCategory.AVATAR,
      createdAt: new Date().toISOString(),
      id: avatar.id,
      parent: avatar.parent ?? null,
      // Awaiting review, unfoldered: the Unsorted and Needs review shelves
      // (LibraryShelfUtil) — the counts the avatar library summary reports.
      qualityStatus: QualityStatus.UNRATED,
      reviewStatus: FleetReviewStatus.PENDING,
      status: IngredientStatus.GENERATED,
      updatedAt: new Date().toISOString(),
    },
    id: avatar.id,
    relationships: {
      metadata: {
        data: { id: avatarMetadataId(avatar), type: 'metadata' },
      },
    },
    type: 'ingredient',
  };
}

function buildAvatarIngredientCollection(avatars: MockAvatarIdentityFixture[]) {
  return {
    data: avatars.map(buildAvatarIngredientDocument),
    included: avatars.map(buildAvatarMetadataResource),
    meta: { page: 1, pageSize: avatars.length, totalCount: avatars.length },
  };
}

function buildVoiceDocument(id: string, label: string, provider: string) {
  return {
    attributes: {
      createdAt: new Date().toISOString(),
      externalVoiceId: `${id}-external`,
      id,
      metadata: {
        extension: 'mp3',
        label,
      },
      provider,
      status: IngredientStatus.GENERATED,
      updatedAt: new Date().toISOString(),
    },
    id,
    type: 'voices',
  };
}

function extractRequestPayload(route: Route): Record<string, unknown> {
  const payload = route.request().postDataJSON() as
    | Record<string, unknown>
    | undefined;
  const nested = payload?.data as
    | { attributes?: Record<string, unknown> }
    | undefined;

  return nested?.attributes ?? payload ?? {};
}

async function routeApiPattern(
  page: Page,
  pathPattern: string,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route(`**/api.genfeed.ai${pathPattern}`, handler);
  await page.route(`**/api.genfeed.ai/v1${pathPattern}`, handler);
  await page.route(`${LOCAL_API}${pathPattern}`, handler);
}

async function routeUsersPattern(
  page: Page,
  pathPattern: string,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route(`**/api.genfeed.ai/users${pathPattern}`, handler);
  await page.route(`**/api.genfeed.ai/v1/users${pathPattern}`, handler);
  await page.route(`${LOCAL_API}/users${pathPattern}`, handler);
}

function buildJsonApiResource<T extends Record<string, unknown>>(
  type: string,
  id: string,
  attributes: T,
) {
  return {
    attributes,
    id,
    type,
  };
}

export function buildExecutionJsonApiResource(
  id: string,
  attributes: Record<string, unknown>,
  // The real serializer config (workflow-execution.config.ts) declares the
  // singular `type: 'workflow-execution'` and every serializer mode sets
  // `pluralizeType: false` (serializer.helper.ts), so the wire type is never
  // pluralized. Every existing caller in this file relies on this default.
  type = 'workflow-execution',
) {
  const resourceAttributes = { ...attributes };
  delete resourceAttributes.id;
  delete resourceAttributes.type;

  return buildJsonApiResource(type, id, resourceAttributes);
}

function buildJsonApiCollection<T extends Record<string, unknown>>(
  type: string,
  resources: Array<{ id: string; attributes: T }>,
) {
  return {
    data: resources.map((resource) =>
      buildJsonApiResource(type, resource.id, resource.attributes),
    ),
    meta: {
      page: 1,
      pageSize: resources.length,
      totalCount: resources.length,
    },
  };
}

function buildJsonApiDocument<T extends Record<string, unknown>>(
  type: string,
  id: string,
  attributes: T,
) {
  return {
    data: buildJsonApiResource(type, id, attributes),
  };
}

function normalizeWorkflow(
  workflow: {
    id: string;
    name: string;
    description: string;
    status: string;
    nodes: unknown[];
    edges: unknown[];
    createdAt: string;
    updatedAt: string;
  },
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    _id: workflow.id,
    createdAt: workflow.createdAt,
    description: workflow.description,
    edgeStyle: 'smoothstep',
    edges: workflow.edges,
    groups: [],
    id: workflow.id,
    label: workflow.name,
    lifecycle: workflow.status,
    name: workflow.name,
    nodeCount: workflow.nodes.length,
    nodes: workflow.nodes,
    organization: 'mock-org-id-e2e-test',
    status: workflow.status,
    updatedAt: workflow.updatedAt,
    ...overrides,
  };
}

/** Mock credits-per-run derivation shared by `normalizeExecution` (the
 * JSON:API resource) and `buildWorkflowExecutionStats` (the summary), so the
 * two mocks can never drift on the completed/non-completed credit split. */
function creditsForMockExecutionStatus(status: string): number {
  return status.toUpperCase() === 'COMPLETED' ? 18 : 7;
}

function normalizeExecution(
  execution: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    logs: string[];
    results: Record<string, unknown>;
  },
  workflowLabel?: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const durationMs =
    execution.completedAt && execution.startedAt
      ? Math.max(
          1000,
          new Date(execution.completedAt).getTime() -
            new Date(execution.startedAt).getTime(),
        )
      : undefined;

  const progressByStatus: Record<string, number> = {
    cancelled: 0,
    completed: 100,
    failed: 65,
    running: 42,
  };

  return {
    _id: execution.id,
    completedAt: execution.completedAt,
    createdAt: execution.startedAt,
    // The serializer exposes creditsUsed at the top level; the history table
    // reads it there when an execution has no accounting summary.
    creditsUsed: creditsForMockExecutionStatus(execution.status),
    durationMs,
    error:
      execution.status === 'FAILED'
        ? String(execution.results.error || 'Execution failed')
        : undefined,
    id: execution.id,
    metadata: {
      creditsUsed: creditsForMockExecutionStatus(execution.status),
      logs: execution.logs,
    },
    nodeResults: execution.logs.map((_log, index) => ({
      completedAt:
        index < execution.logs.length - 1 || execution.status !== 'RUNNING'
          ? execution.completedAt || new Date().toISOString()
          : undefined,
      error:
        execution.status === 'FAILED' && index === execution.logs.length - 1
          ? String(execution.results.error || execution.logs[index])
          : undefined,
      nodeId: `node-${index + 1}`,
      nodeType: index === execution.logs.length - 1 ? 'publish' : 'generate',
      output: index === execution.logs.length - 1 ? execution.results : {},
      progress:
        execution.status === 'RUNNING' && index === execution.logs.length - 1
          ? 42
          : 100,
      startedAt: execution.startedAt,
      status:
        execution.status === 'FAILED' && index === execution.logs.length - 1
          ? 'FAILED'
          : execution.status === 'RUNNING' &&
              index === execution.logs.length - 1
            ? 'RUNNING'
            : 'COMPLETED',
    })),
    progress: progressByStatus[execution.status] ?? 0,
    startedAt: execution.startedAt,
    status: execution.status,
    trigger: 'manual',
    updatedAt: execution.completedAt || execution.startedAt,
    workflow: {
      _id: execution.workflowId,
      label: workflowLabel || execution.workflowId,
    },
    ...overrides,
  };
}

function buildTemplateSteps(count: number, templateId: string) {
  return Array.from({ length: count }, (_, index) => ({
    category: index === count - 1 ? 'publish' : 'generate',
    config: {},
    id: `${templateId}-step-${index + 1}`,
    name: `Step ${index + 1}`,
  }));
}

function buildPostAttributes(
  post: Record<string, unknown>,
): Record<string, unknown> {
  const attributes = { ...post };
  delete attributes.platformUrl;

  return {
    ...attributes,
    _id: String(post.id),
  };
}

// ----------------------------------------------------------------------------
// Video Generation Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for successful video generation flow
 */
export async function mockVideoGenerationSuccess(
  page: Page,
  options: GenerationMockOptions = {},
): Promise<void> {
  const { delay = 100, finalStatus = 'completed' } = options;

  await page.route('**/api.genfeed.ai/v1/videos', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('video'),
              progress: 0,
              status: 'processing',
            },
            id: 'mock-video-generated',
            type: 'videos',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  // Mock status polling
  await page.route(
    '**/api.genfeed.ai/v1/videos/mock-video-generated',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('video'),
              progress: 100,
              status: finalStatus,
              url: 'https://cdn.genfeed.ai/mock/video/completed.mp4',
            },
            id: 'mock-video-generated',
            type: 'videos',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

/**
 * Mock for failed video generation
 */
export async function mockVideoGenerationFailure(
  page: Page,
  errorMessage = 'Generation failed due to content policy violation',
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/videos', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          errors: [
            {
              detail: errorMessage,
              status: '400',
              title: 'Generation Failed',
            },
          ],
        }),
        contentType: 'application/json',
        status: 400,
      });
      return;
    }

    await route.continue();
  });
}

/**
 * Mock for video generation with progress updates
 */
export async function mockVideoGenerationWithProgress(page: Page): Promise<{
  updateProgress: (progress: number) => void;
  complete: () => void;
}> {
  let currentProgress = 0;
  let isComplete = false;

  await page.route('**/api.genfeed.ai/v1/videos', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('video'),
              progress: 0,
              status: 'processing',
            },
            id: 'mock-video-progress',
            type: 'videos',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await page.route(
    '**/api.genfeed.ai/v1/videos/mock-video-progress',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('video'),
              progress: currentProgress,
              status: isComplete ? 'completed' : 'processing',
            },
            id: 'mock-video-progress',
            type: 'videos',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  return {
    complete: () => {
      isComplete = true;
      currentProgress = 100;
    },
    updateProgress: (progress: number) => {
      currentProgress = progress;
    },
  };
}

// ----------------------------------------------------------------------------
// Image Generation Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for successful image generation
 */
export async function mockImageGenerationSuccess(
  page: Page,
  options: GenerationMockOptions = {},
): Promise<void> {
  const { delay = 100, finalStatus = 'completed' } = options;

  await routeApiPattern(page, '/images**', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('image'),
              status: finalStatus,
              url: 'https://cdn.genfeed.ai/mock/image/generated.png',
            },
            id: 'mock-image-generated',
            type: 'images',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection('images', [
          {
            attributes: {
              ...generateMockIngredient('image'),
              status: finalStatus,
              url: 'https://cdn.genfeed.ai/mock/image/generated.png',
            },
            id: 'mock-image-generated',
          },
        ]),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for failed image generation
 */
export async function mockImageGenerationFailure(
  page: Page,
  errorMessage = 'Image generation failed',
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/images', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          errors: [
            {
              detail: errorMessage,
              status: '400',
              title: 'Generation Failed',
            },
          ],
        }),
        contentType: 'application/json',
        status: 400,
      });
      return;
    }

    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Music Generation Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for successful music generation
 */
export async function mockMusicGenerationSuccess(
  page: Page,
  options: GenerationMockOptions = {},
): Promise<void> {
  const { delay = 100 } = options;

  await page.route('**/api.genfeed.ai/v1/musics', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('music'),
              duration: 180,
              status: 'completed',
              url: 'https://cdn.genfeed.ai/mock/music/generated.mp3',
              waveformUrl: 'https://cdn.genfeed.ai/mock/music/waveform.png',
            },
            id: 'mock-music-generated',
            type: 'musics',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Avatar Generation Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for successful avatar video generation
 */
export async function mockAvatarGenerationSuccess(
  page: Page,
  options: GenerationMockOptions = {},
): Promise<void> {
  const { delay = 100 } = options;

  await page.route('**/api.genfeed.ai/v1/avatars', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              ...generateMockIngredient('avatar'),
              status: 'processing',
            },
            id: 'mock-avatar-generated',
            type: 'avatars',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Billing Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for active subscription
 */
export async function mockActiveSubscription(
  page: Page,
  options: BillingMockOptions = {},
): Promise<void> {
  const { plan = 'pro', credits = 500, hasPaymentMethod = true } = options;

  await routeApiPattern(page, '/subscriptions**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            ...generateMockSubscription({ plan, status: 'active' }),
            hasPaymentMethod,
          },
          id: 'mock-subscription',
          type: 'subscriptions',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/credits/topbar-balances**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            generatedAt: new Date().toISOString(),
            segments: [
              {
                balance: credits,
                currencyOrUnit: 'credits',
                label: 'Genfeed',
                lastSyncedAt: new Date().toISOString(),
                provider: 'genfeed',
                status: 'available',
              },
            ],
          },
          id: 'topbar-balances',
          type: 'topbar-balances',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/credits**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            available: credits,
            total: Math.floor(credits * 1.25),
            used: Math.floor(credits * 0.25),
          },
          id: 'mock-credits',
          type: 'credits',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for insufficient credits
 */
export async function mockInsufficientCredits(page: Page): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/credits/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            available: 0,
            total: 1000,
            used: 1000,
          },
          id: 'mock-credits',
          type: 'credits',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Mock generation endpoints to return credit error
  const generationEndpoints = ['videos', 'images', 'musics', 'avatars'];

  for (const endpoint of generationEndpoints) {
    await page.route(`**/api.genfeed.ai/v1/${endpoint}`, async (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        await route.fulfill({
          body: JSON.stringify({
            errors: [
              {
                detail:
                  'You have run out of credits. Please upgrade your plan.',
                status: '402',
                title: 'Insufficient Credits',
              },
            ],
          }),
          contentType: 'application/json',
          status: 402,
        });
        return;
      }

      await route.continue();
    });
  }
}

/**
 * Mock for expired subscription
 */
export async function mockExpiredSubscription(page: Page): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/subscriptions/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            ...generateMockSubscription({ plan: 'free', status: 'expired' }),
          },
          id: 'mock-subscription',
          type: 'subscriptions',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

// ----------------------------------------------------------------------------
// User & Organization Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for user profile data
 */
export async function mockUserProfile(
  page: Page,
  userData: Partial<ReturnType<typeof generateMockUser>> = {},
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/users/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            ...generateMockUser(),
            ...userData,
          },
          id: 'mock-user',
          type: 'users',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for organization data
 */
export async function mockOrganization(
  page: Page,
  orgData: Partial<ReturnType<typeof generateMockOrganization>> = {},
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/organizations/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            ...generateMockOrganization(),
            ...orgData,
          },
          id: 'mock-org',
          type: 'organizations',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

// ----------------------------------------------------------------------------
// Content Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for content library (videos, images, etc.)
 */
export async function mockContentLibrary(
  page: Page,
  contentType: 'videos' | 'images' | 'musics',
  count = 10,
): Promise<void> {
  const items = Array.from({ length: count }, (_, i) =>
    generateMockIngredient(contentType.slice(0, -1), {
      id: `mock-${contentType}-${i}`,
    }),
  );

  await page.route(`**/api.genfeed.ai/v1/${contentType}`, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: items.map((item, _i) => ({
            attributes: item,
            id: item.id,
            type: contentType,
          })),
          meta: {
            page: 1,
            pageSize: count,
            totalCount: count,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });
}

/**
 * Mock for empty content library
 */
export async function mockEmptyContentLibrary(
  page: Page,
  contentType: 'videos' | 'images' | 'musics',
): Promise<void> {
  await page.route(`**/api.genfeed.ai/v1/${contentType}`, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [],
          meta: {
            page: 1,
            pageSize: 10,
            totalCount: 0,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Analytics Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for analytics/dashboard data
 */
export async function mockAnalyticsData(page: Page): Promise<void> {
  const periodEnd = '2025-03-01T12:00:00.000Z';
  const periodStart = '2025-02-01T12:00:00.000Z';
  await routeApiPattern(page, '/auth/bootstrap/overview**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        analytics: {
          activePlatforms: ['instagram', 'tiktok'],
          activeWorkflows: 2,
          bestPerformingPlatform: 'instagram',
          pendingPosts: 3,
          totalCredentialsConnected: 2,
          totalImages: 8,
          totalPosts: 12,
          totalVideos: 4,
          totalViews: 1200,
          viewsGrowth: 18,
        },
        reviewInbox: {
          approvedCount: 1,
          changesRequestedCount: 1,
          pendingCount: 2,
          readyCount: 2,
          recentItems: [
            {
              createdAt: '2026-03-28T10:15:00.000Z',
              format: 'caption',
              id: 'recent-output-1',
              platform: 'instagram',
              reviewDecision: 'approved',
              status: 'approved',
              summary: 'Launch caption approved',
            },
            {
              createdAt: '2026-03-28T09:40:00.000Z',
              format: 'image',
              id: 'recent-output-2',
              status: 'pending',
              summary: 'Thumbnail direction generated',
            },
          ],
          rejectedCount: 0,
        },
        timeSeries: [
          { date: '2026-03-04', instagram: 20, tiktok: 10 },
          { date: '2026-03-05', instagram: 24, tiktok: 12 },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await routeApiPattern(page, '/analytics/**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            avatarsGenerated: 8,
            creditsUsed: 2500,
            imagesGenerated: 156,
            musicGenerated: 12,
            periodEnd,
            periodStart,
            storageUsed: 1024 * 1024 * 500, // 500MB
            videosGenerated: 42,
          },
          id: 'mock-analytics',
          type: 'analytics',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // `/analytics/top` (AnalyticsService.getTopContent, used by useTopPosts) is a
  // JSON:API *collection* — registered after the broad `/analytics/**` handler
  // above so it wins (Playwright matches routes in reverse registration order).
  // Without this, the generic single-resource body deserializes as an object
  // and `deserializeCollection` throws "expected data to be an array", which
  // AnalyticsPostsList surfaces as a "could not be loaded" error state.
  // Attribute names match the real, now-fixed server contract
  // (`AnalyticsTopPostSerializer` / `analyticsResponseProjection.
  // buildTopContent`) — see genfeedai/genfeed.ai#5404.
  await routeApiPattern(page, '/analytics/top**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: {
              brandLogo: null,
              brandName: 'Brand 1',
              description: 'Launch day recap',
              engagementRate: 7.4,
              ingredientUrl: null,
              isVideo: false,
              label: 'Launch day recap',
              platform: 'tiktok',
              postId: 'post-1',
              thumbnailUrl: null,
              totalComments: 45,
              totalEngagement: 887,
              totalLikes: 800,
              totalSaves: 12,
              totalShares: 30,
              totalViews: 12000,
            },
            id: 'top-post-1',
            type: 'analytics-top-post',
          },
          {
            attributes: {
              brandLogo: null,
              brandName: 'Brand 1',
              description: 'Behind the scenes',
              engagementRate: 5.1,
              ingredientUrl: null,
              isVideo: false,
              label: 'Behind the scenes',
              platform: 'instagram',
              postId: 'post-2',
              thumbnailUrl: null,
              totalComments: 20,
              totalEngagement: 410,
              totalLikes: 360,
              totalSaves: 8,
              totalShares: 22,
              totalViews: 8000,
            },
            id: 'top-post-2',
            type: 'analytics-top-post',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/activities**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: {
              createdAt: periodEnd,
              isRead: false,
              key: ActivityKey.VIDEO_GENERATED,
              source: 'video-generate',
              value: '',
            },
            id: 'activity-1',
            type: 'activities',
          },
          {
            attributes: {
              createdAt: '2025-03-01T11:00:00.000Z',
              isRead: true,
              key: ActivityKey.IMAGE_GENERATED,
              source: 'image-generate',
              value: '',
            },
            id: 'activity-2',
            type: 'activities',
          },
          {
            attributes: {
              createdAt: '2025-02-28T12:00:00.000Z',
              isRead: true,
              key: ActivityKey.CREDITS_ADD,
              source: 'credits-subscription',
              value: '250',
            },
            id: 'activity-3',
            type: 'activities',
          },
        ],
        meta: {
          page: 1,
          pageSize: 10,
          totalCount: 3,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

interface MockWorkspaceTaskRecord {
  brand?: string | null;
  chosenModel?: string;
  chosenProvider?: string;
  completedAt?: string;
  createdAt: string;
  dismissedAt?: string;
  executionPathUsed:
    | 'agent_orchestrator'
    | 'caption_generation'
    | 'image_generation'
    | 'video_generation';
  failureReason?: string;
  id: string;
  linkedApprovalIds: string[];
  linkedOutputIds: string[];
  linkedExecutionIds: string[];
  organization: string;
  outputType: 'caption' | 'image' | 'ingredient' | 'video';
  platforms: string[];
  planningThreadId?: string;
  priority: 'high' | 'low' | 'normal';
  request: string;
  requestedChangesReason?: string;
  resultPreview?: string;
  reviewState:
    | 'approved'
    | 'changes_requested'
    | 'dismissed'
    | 'none'
    | 'pending_approval';
  routingSummary: string;
  skillVariantIds?: string[];
  skillsUsed?: string[];
  reviewTriggered?: boolean;
  status:
    | 'completed'
    | 'dismissed'
    | 'failed'
    | 'in_progress'
    | 'needs_review'
    | 'triaged';
  title: string;
  updatedAt: string;
  user: string;
}

interface MockWorkspacePlanningPlanStep {
  details: string;
  outputType: MockWorkspaceTaskRecord['outputType'];
  title: string;
}

interface MockWorkspacePlanningThreadRecord {
  createdAt: string;
  id: string;
  messageContent: string;
  proposedPlan: {
    content: string;
    createdAt: string;
    id: string;
    status: 'approved';
    steps: MockWorkspacePlanningPlanStep[];
    updatedAt: string;
  };
  source: string;
  sourceTaskId: string;
  title: string;
  updatedAt: string;
}

function buildMockWorkspaceTask(
  overrides: Partial<MockWorkspaceTaskRecord>,
): MockWorkspaceTaskRecord {
  const nowIso = new Date().toISOString();

  return {
    createdAt: nowIso,
    executionPathUsed: 'agent_orchestrator',
    id: overrides.id ?? `workspace-task-${Date.now()}`,
    linkedApprovalIds: [],
    linkedOutputIds: [],
    linkedExecutionIds: [],
    organization: 'mock-org-id-e2e-test',
    outputType: 'ingredient',
    planningThreadId: undefined,
    platforms: [],
    priority: 'normal',
    request: 'Create something useful for the workspace.',
    reviewState: 'none',
    reviewTriggered: false,
    routingSummary:
      'Detected a broader ingredient request and routed it to the orchestration path.',
    skillsUsed: [],
    skillVariantIds: [],
    status: 'triaged',
    title: 'Workspace task',
    updatedAt: nowIso,
    user: 'mock-user-id-e2e-test',
    ...overrides,
  };
}

function buildWorkspaceTaskFromPayload(
  payload: Record<string, unknown>,
  sequence: number,
): MockWorkspaceTaskRecord {
  const request = String(payload.request ?? 'Untitled workspace task');
  const outputType =
    (payload.outputType as MockWorkspaceTaskRecord['outputType']) ??
    'ingredient';
  const nowIso = new Date(Date.now() + sequence * 1000).toISOString();
  const title =
    typeof payload.title === 'string' && payload.title.trim().length > 0
      ? payload.title.trim()
      : request;

  if (outputType === 'image') {
    return buildMockWorkspaceTask({
      createdAt: nowIso,
      executionPathUsed: 'image_generation',
      id: `workspace-task-image-${sequence}`,
      outputType: 'image',
      request,
      reviewState: 'none',
      routingSummary:
        'Detected an image ingredient request and routed it to the image generation path.',
      status: 'in_progress',
      title,
      updatedAt: nowIso,
    });
  }

  if (outputType === 'video') {
    return buildMockWorkspaceTask({
      createdAt: nowIso,
      executionPathUsed: 'video_generation',
      id: `workspace-task-video-${sequence}`,
      outputType: 'video',
      request,
      reviewState: 'none',
      routingSummary:
        'Detected a short-form video request and routed it to the video generation path.',
      status: 'in_progress',
      title,
      updatedAt: nowIso,
    });
  }

  if (outputType === 'caption') {
    return buildMockWorkspaceTask({
      createdAt: nowIso,
      executionPathUsed: 'caption_generation',
      id: `workspace-task-caption-${sequence}`,
      outputType: 'caption',
      request,
      resultPreview: `Draft caption prepared for review: ${title}`,
      reviewState: 'pending_approval',
      routingSummary:
        'Detected a writing request and routed it to the caption generation path for review.',
      status: 'needs_review',
      title,
      updatedAt: nowIso,
    });
  }

  return buildMockWorkspaceTask({
    createdAt: nowIso,
    executionPathUsed: 'agent_orchestrator',
    id: `workspace-task-generic-${sequence}`,
    outputType: 'ingredient',
    request,
    reviewState: 'none',
    routingSummary:
      'Detected a broader ingredient request and routed it to the orchestration path.',
    status: 'triaged',
    title,
    updatedAt: nowIso,
  });
}

function buildWorkspaceLinkedIngredientDocument(id: string) {
  return buildJsonApiDocument('ingredients', id, {
    category: 'ingredient',
    createdAt: new Date().toISOString(),
    id,
    metadata: {
      description: 'Hook variants for the campaign brief.',
      label: 'Campaign Hook Pack',
    },
    prompt: {
      original: 'Create three launch-ready hooks.',
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function mockWorkspaceTasks(
  page: Page,
  overrides: MockWorkspaceTaskRecord[] = [],
): Promise<void> {
  let sequence = 3;
  const planningThreads = new Map<string, MockWorkspacePlanningThreadRecord>();
  let tasks: MockWorkspaceTaskRecord[] =
    overrides.length > 0
      ? overrides
      : [
          buildMockWorkspaceTask({
            executionPathUsed: 'caption_generation',
            id: 'workspace-task-review-1',
            linkedOutputIds: ['ingredient-output-1'],
            outputType: 'caption',
            request: 'Write a launch caption for the homepage update.',
            resultPreview:
              'Draft caption prepared for review: Write a launch caption for the homepage update.',
            reviewState: 'pending_approval',
            reviewTriggered: true,
            routingSummary:
              'Detected a writing request and routed it to the caption generation path for review.',
            skillsUsed: ['launch-caption-reviewer'],
            status: 'needs_review',
            title: 'Launch caption',
          }),
          buildMockWorkspaceTask({
            executionPathUsed: 'image_generation',
            id: 'workspace-task-progress-1',
            linkedOutputIds: ['ingredient-output-1'],
            outputType: 'image',
            request: 'Generate three image directions for the April launch.',
            reviewState: 'none',
            routingSummary:
              'Resolved the request using the brand skill "YouTube Script Setup" (youtube-script-setup) for the creation stage.',
            skillsUsed: ['youtube-script-setup'],
            skillVariantIds: ['variant-youtube-script-setup'],
            status: 'in_progress',
            title: 'April launch imagery',
          }),
        ];

  const getTaskById = (taskId: string): MockWorkspaceTaskRecord | undefined =>
    tasks.find((task) => task.id === taskId);

  const hasLinkedOutput = (outputId: string): boolean =>
    tasks.some((task) => task.linkedOutputIds.includes(outputId));

  const createPlanningThread = (
    task: MockWorkspaceTaskRecord,
  ): MockWorkspacePlanningThreadRecord => {
    const nowIso = new Date().toISOString();
    const unresolvedSummary =
      task.reviewState === 'changes_requested'
        ? (task.requestedChangesReason ??
          'Requested changes still need to be incorporated.')
        : task.status === 'failed'
          ? (task.failureReason ??
            'The original task failed and needs a recovery plan.')
          : task.reviewState === 'pending_approval'
            ? 'The current result still needs review and approval.'
            : 'The core task is complete, but the follow-through work has not been turned into explicit next tasks yet.';
    const titleBase = task.title || 'workspace task';
    const steps: MockWorkspacePlanningPlanStep[] = [
      {
        details:
          'Turn the current work into a publication-ready caption or rollout summary.',
        outputType: 'caption',
        title: `Package ${titleBase} into launch copy`,
      },
      {
        details:
          'Create a supporting visual direction that matches the reviewed work.',
        outputType: 'image',
        title: `Create supporting visual for ${titleBase}`,
      },
    ];

    return {
      createdAt: nowIso,
      id: task.planningThreadId ?? `thread-plan-${task.id}`,
      messageContent: [
        `Completed work so far: ${task.resultPreview ?? task.routingSummary ?? task.request}`,
        `Still unresolved: ${unresolvedSummary}`,
        `SHOULD happen next: ${steps[0]?.title ?? 'Package the next deliverable.'}`,
        `COULD happen next: ${steps[1]?.title ?? 'Create an optional supporting asset.'}`,
      ].join('\n\n'),
      proposedPlan: {
        content: steps
          .map((step, index) => `${index + 1}. ${step.title}`)
          .join('\n'),
        createdAt: nowIso,
        id: `plan-${task.id}`,
        status: 'approved',
        steps,
        updatedAt: nowIso,
      },
      source: `workspace-planning:${task.id}`,
      sourceTaskId: task.id,
      title: `Plan next steps: ${task.title}`,
      updatedAt: nowIso,
    };
  };

  const ensurePlanningThread = (
    taskId: string,
  ): {
    created: boolean;
    seeded: boolean;
    thread: MockWorkspacePlanningThreadRecord;
  } => {
    const task = getTaskById(taskId);

    if (!task) {
      throw new Error(`Unknown workspace task: ${taskId}`);
    }

    if (task.planningThreadId) {
      const existingThread = planningThreads.get(task.planningThreadId);

      if (existingThread) {
        return {
          created: false,
          seeded: false,
          thread: existingThread,
        };
      }
    }

    const thread = createPlanningThread(task);
    planningThreads.set(thread.id, thread);
    task.planningThreadId = thread.id;

    return {
      created: true,
      seeded: true,
      thread,
    };
  };

  await routeApiPattern(page, '/tasks**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (method === 'GET') {
      const view = url.searchParams.get('view');
      const filteredTasks =
        view === 'inbox'
          ? tasks.filter(
              (task) =>
                task.reviewState === 'pending_approval' ||
                task.reviewState === 'changes_requested' ||
                task.status === 'completed' ||
                task.status === 'failed',
            )
          : view === 'in_progress'
            ? tasks.filter(
                (task) =>
                  task.status === 'triaged' || task.status === 'in_progress',
              )
            : tasks;

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'workspace-task',
            filteredTasks.map((task) => ({
              attributes: task,
              id: task.id,
            })),
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const planThreadMatch = pathname.match(/\/tasks\/([^/]+)\/plan-thread$/);
    if (method === 'POST' && planThreadMatch) {
      const [, taskId] = planThreadMatch;
      const { created, seeded, thread } = ensurePlanningThread(taskId);

      await route.fulfill({
        body: JSON.stringify({
          created,
          seeded,
          threadId: thread.id,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const followUpTasksMatch = pathname.match(
      /\/tasks\/([^/]+)\/follow-up-tasks$/,
    );
    if (method === 'POST' && followUpTasksMatch) {
      const [, taskId] = followUpTasksMatch;
      const task = getTaskById(taskId);
      const thread = task?.planningThreadId
        ? planningThreads.get(task.planningThreadId)
        : undefined;

      if (!task || !thread) {
        await route.fulfill({
          body: JSON.stringify({ message: 'No planning thread exists yet.' }),
          contentType: 'application/json',
          status: 400,
        });
        return;
      }

      const createdTasks = thread.proposedPlan.steps.map((step) => {
        const createdTask = buildWorkspaceTaskFromPayload(
          {
            outputType: step.outputType,
            request: `${step.title}\n\n${step.details}`,
            title: step.title,
          },
          sequence,
        );
        sequence += 1;

        return createdTask;
      });

      tasks = [...createdTasks, ...tasks];

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'workspace-task',
            createdTasks.map((createdTask) => ({
              attributes: createdTask,
              id: createdTask.id,
            })),
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (method === 'POST' && pathname.endsWith('/tasks')) {
      const payload = extractRequestPayload(route);
      const createdTask = buildWorkspaceTaskFromPayload(payload, sequence);
      sequence += 1;
      tasks = [createdTask, ...tasks];

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workspace-task', createdTask.id, createdTask),
        ),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    // Review transitions are now field updates on the task resource:
    // PATCH /tasks/:id { reviewState: 'approved' | 'changes_requested' | 'dismissed' }
    const reviewMatch = pathname.match(/\/tasks\/([^/]+)$/);
    if (method === 'PATCH' && reviewMatch) {
      const [, taskId] = reviewMatch;
      const payload = extractRequestPayload(route);
      const reviewState =
        typeof payload.reviewState === 'string'
          ? payload.reviewState
          : undefined;

      if (reviewState === 'approved') {
        tasks = tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completedAt: new Date().toISOString(),
                reviewState: 'approved',
                status: 'completed',
                updatedAt: new Date().toISOString(),
              }
            : task,
        );
      } else if (reviewState === 'changes_requested') {
        const reason = String(
          payload.reason ?? 'Please revise this task from the workspace inbox.',
        );
        tasks = tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                requestedChangesReason: reason,
                reviewState: 'changes_requested',
                status: 'needs_review',
                updatedAt: new Date().toISOString(),
              }
            : task,
        );
      } else if (reviewState === 'dismissed') {
        const reason =
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : undefined;
        tasks = tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                dismissedAt: new Date().toISOString(),
                failureReason: reason,
                reviewState: 'dismissed',
                status: 'dismissed',
                updatedAt: new Date().toISOString(),
              }
            : task,
        );
      } else {
        // Non-review PATCH — defer to the default handler.
        await route.continue();
        return;
      }

      const task = tasks.find((item) => item.id === taskId);
      if (!task) {
        await route.fulfill({
          body: JSON.stringify({ message: `Task ${taskId} not found.` }),
          contentType: 'application/json',
          status: 404,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workspace-task', task.id, task),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  await routeApiPattern(page, '/ingredients/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const pathname = new URL(route.request().url()).pathname;
    const outputId = pathname.split('/').pop();

    if (!outputId || !hasLinkedOutput(outputId)) {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: JSON.stringify(buildWorkspaceLinkedIngredientDocument(outputId)),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/threads**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (method !== 'GET') {
      await route.continue();
      return;
    }

    const messagesMatch = pathname.match(/\/threads\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const [, threadId] = messagesMatch;
      const thread = planningThreads.get(threadId);

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'message',
            thread
              ? [
                  {
                    attributes: {
                      content: thread.messageContent,
                      createdAt: thread.createdAt,
                      id: `message-${thread.id}`,
                      metadata: {
                        proposedPlan: thread.proposedPlan,
                      },
                      role: 'assistant',
                      threadId: thread.id,
                    },
                    id: `message-${thread.id}`,
                  },
                ]
              : [],
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const snapshotMatch = pathname.match(/\/threads\/([^/]+)\/snapshot$/);
    if (snapshotMatch) {
      const [, threadId] = snapshotMatch;
      const thread = planningThreads.get(threadId);

      if (!thread) {
        await route.fulfill({
          body: JSON.stringify({ message: 'Thread not found.' }),
          contentType: 'application/json',
          status: 404,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          activeRun: null,
          lastAssistantMessage: null,
          lastSequence: 1,
          latestProposedPlan: thread.proposedPlan,
          latestUiBlocks: null,
          memorySummaryRefs: [],
          pendingApprovals: [],
          pendingInputRequests: [],
          profileSnapshot: null,
          sessionBinding: null,
          source: thread.source,
          threadId: thread.id,
          threadStatus: 'active',
          timeline: [],
          title: thread.title,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const threadMatch = pathname.match(/\/threads\/([^/]+)$/);
    if (threadMatch) {
      const [, threadId] = threadMatch;
      const thread = planningThreads.get(threadId);

      if (!thread) {
        await route.fulfill({
          body: JSON.stringify({ message: 'Thread not found.' }),
          contentType: 'application/json',
          status: 404,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('thread', thread.id, {
            createdAt: thread.createdAt,
            id: thread.id,
            mode: AgentThreadMode.PLAN,
            source: thread.source,
            status: 'active',
            title: thread.title,
            updatedAt: thread.updatedAt,
          }),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (pathname.endsWith('/threads')) {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'thread',
            Array.from(planningThreads.values()).map((thread) => ({
              attributes: {
                createdAt: thread.createdAt,
                id: thread.id,
                mode: AgentThreadMode.PLAN,
                source: thread.source,
                status: 'active',
                title: thread.title,
                updatedAt: thread.updatedAt,
              },
              id: thread.id,
            })),
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });
}

interface MockSkillRecord {
  baseSkill?: string | null;
  category: string;
  channels: string[];
  defaultInstructions?: string;
  description: string;
  id: string;
  inputSchema?: Record<string, unknown>;
  isBuiltIn: boolean;
  isEnabled: boolean;
  modalities: string[];
  name: string;
  organization?: string | null;
  outputSchema?: Record<string, unknown>;
  requiredProviders: string[];
  reviewDefaults?: Record<string, unknown>;
  slug: string;
  source: 'built_in' | 'custom' | 'imported';
  status: 'disabled' | 'draft' | 'published';
  workflowStage:
    | 'analysis'
    | 'creation'
    | 'planning'
    | 'publishing'
    | 'research'
    | 'review';
}

export async function mockSkillsCatalog(page: Page): Promise<void> {
  const baseSkill: MockSkillRecord = {
    category: 'copywriting',
    channels: ['youtube', 'linkedin'],
    defaultInstructions:
      'Structure the output for channel-specific launch copy.',
    description:
      'Sets up brand-aligned long-form scripts and launch messaging.',
    id: 'skill-youtube-script-setup',
    isBuiltIn: true,
    isEnabled: true,
    modalities: ['text'],
    name: 'YouTube Script Setup',
    organization: null,
    requiredProviders: ['openai'],
    reviewDefaults: { requiresApproval: false },
    slug: 'youtube-script-setup',
    source: 'built_in',
    status: 'published',
    workflowStage: 'creation',
  };
  const variantSkill: MockSkillRecord = {
    ...baseSkill,
    baseSkill: baseSkill.id,
    defaultInstructions:
      'Favor direct hooks, performance framing, and creator-style pacing.',
    description: 'Brand-tuned variant for punchier creator launch scripts.',
    id: 'variant-youtube-script-setup',
    isBuiltIn: false,
    name: 'YouTube Script Setup Custom',
    organization: 'mock-org-id-e2e-test',
    slug: 'youtube-script-setup-custom',
    source: 'custom',
    status: 'draft',
  };
  const reviewerSkill: MockSkillRecord = {
    category: 'copywriting',
    channels: ['linkedin', 'x'],
    defaultInstructions: 'Review launch captions for clarity and CTA strength.',
    description: 'Reviews short-form launch captions before publishing.',
    id: 'skill-launch-caption-reviewer',
    isBuiltIn: true,
    isEnabled: true,
    modalities: ['text'],
    name: 'Launch Caption Reviewer',
    organization: null,
    requiredProviders: ['openai'],
    reviewDefaults: { requiresApproval: true },
    slug: 'launch-caption-reviewer',
    source: 'built_in',
    status: 'published',
    workflowStage: 'review',
  };

  const skills = [baseSkill, variantSkill, reviewerSkill];

  await routeApiPattern(page, '/skills**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'skill',
            skills.map((skill) => ({
              attributes: skill,
              id: skill.id,
              type: 'skills',
            })),
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        errors: [{ detail: `Unhandled method ${method} for skills mock.` }],
      }),
      contentType: 'application/json',
      status: 400,
    });
  });
}

export async function mockOverviewRunsData(
  page: Page,
  runs: Array<Record<string, unknown>>,
): Promise<void> {
  await routeApiPattern(page, '/auth/bootstrap/overview**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRuns: runs.filter((run) => run.status === 'running'),
        analytics: {
          activePlatforms: ['instagram', 'tiktok'],
          activeWorkflows: 2,
          bestPerformingPlatform: 'instagram',
          pendingPosts: 3,
          totalCredentialsConnected: 2,
          totalImages: 8,
          totalPosts: 12,
          totalVideos: 4,
          totalViews: 1200,
          viewsGrowth: 18,
        },
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 1,
          readyCount: 2,
          recentItems: [],
          rejectedCount: 0,
        },
        runs,
        stats: {
          activeRuns: runs.filter((run) => run.status === 'running').length,
          completedToday: runs.filter((run) => run.status === 'completed')
            .length,
          failedToday: runs.filter((run) => run.status === 'failed').length,
          totalCreditsToday: 25,
          totalRuns: runs.length,
        },
        timeSeries: [
          { date: '2026-03-04', instagram: 20, tiktok: 10 },
          { date: '2026-03-05', instagram: 24, tiktok: 12 },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

// ----------------------------------------------------------------------------
// Workflow Mocks
// ----------------------------------------------------------------------------

/**
 * The system catalog is a filter on the workflows collection, not a path:
 * `GET /workflows?source=system-catalog` (#2225, workflow-api.listSystemCatalog).
 * Substring-matching `/workflows/system-catalog` therefore never fires — parse
 * the query instead so these guards keep working when the path shape moves.
 */
function isSystemCatalogRequest(route: Route): boolean {
  return (
    new URL(route.request().url()).searchParams.get('source') ===
    'system-catalog'
  );
}

/**
 * `GET /workflows/featured` (#5511) is the plain `{ data: [] }` Featured row,
 * not a workflow by id — the `/workflows/*` CRUD pattern would otherwise answer
 * it with a single JSON:API workflow resource and break `listFeatured()`.
 */
function isFeaturedWorkflowsRequest(route: Route): boolean {
  return (
    route.request().method() === 'GET' &&
    /\/workflows\/featured\/?$/.test(new URL(route.request().url()).pathname)
  );
}

/**
 * Mock for workflow CRUD operations
 */
export async function mockWorkflowCrud(
  page: Page,
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    nodes: unknown[];
    edges: unknown[];
    createdAt: string;
    updatedAt: string;
    thumbnail?: string;
  }> = [],
): Promise<void> {
  await routeApiPattern(page, '/workflows**', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Catalog/templates requests must not be treated as workflow CRUD
    // list/create — the list branch would otherwise answer the catalog with the
    // full workflows collection and break `listSystemCatalog().filter(...)`
    // (#2176 / #1626).
    if (isSystemCatalogRequest(route)) {
      if (method === 'GET') {
        await route.fulfill({
          body: JSON.stringify({ data: [] }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.fallback();
      return;
    }
    if (isFeaturedWorkflowsRequest(route)) {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (url.includes('/workflows/templates')) {
      await route.fallback();
      return;
    }

    if (method === 'GET') {
      const resources = workflows.map((workflow) => ({
        attributes: normalizeWorkflow(workflow, {
          thumbnail: workflow.thumbnail ?? null,
        }),
        id: workflow.id,
      }));
      await route.fulfill({
        body: JSON.stringify(buildJsonApiCollection('workflows', resources)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'POST') {
      const workflow = normalizeWorkflow(
        {
          createdAt: new Date().toISOString(),
          description: '',
          edges: [],
          id: 'workflow-new',
          name: 'Untitled Workflow',
          nodes: [],
          status: 'draft',
          thumbnail: undefined,
          updatedAt: new Date().toISOString(),
        },
        { metadata: { createdFrom: 'e2e-template-bootstrap' } },
      );
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workflows', 'workflow-new', workflow),
        ),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, '/workflows/*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Trailing-slash form (`/workflows/?source=system-catalog`) lands here
    // rather than on the collection pattern above — same answer either way.
    if (isSystemCatalogRequest(route)) {
      if (method === 'GET') {
        await route.fulfill({
          body: JSON.stringify({ data: [] }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.fallback();
      return;
    }
    if (isFeaturedWorkflowsRequest(route)) {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (url.includes('/workflows/templates')) {
      await route.fallback();
      return;
    }

    const idMatch = url.match(/\/workflows\/([^/?]+)/);
    const id = idMatch ? idMatch[1] : 'workflow-001';
    const found = workflows.find((w) => w.id === id);
    const workflow = found || {
      createdAt: new Date().toISOString(),
      description: 'Mock workflow',
      edges: [],
      id,
      name: 'Mock Workflow',
      nodes: [],
      status: 'draft',
      thumbnail: undefined,
      updatedAt: new Date().toISOString(),
    };

    if (method === 'GET') {
      const normalized = normalizeWorkflow(workflow, {
        thumbnail: workflow.thumbnail ?? null,
      });
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workflows', workflow.id, normalized),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const normalized = normalizeWorkflow(workflow, {
        thumbnail: workflow.thumbnail ?? null,
        updatedAt: new Date().toISOString(),
      });
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workflows', workflow.id, normalized),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 204,
      });
      return;
    }
    await route.continue();
  });
}

/**
 * `GET /workflow-executions?view=statistics` is a summary object, not a
 * JSON:API collection. Returning the collection makes `data` an array and
 * the runs page throws while formatting counters, which unmounts the history.
 */
function buildWorkflowExecutionStats(
  executions: Array<{ status: string }>,
): Record<string, number> {
  const normalized = executions.map((execution) =>
    execution.status.toUpperCase(),
  );
  const completed = normalized.filter(
    (status) => status === 'COMPLETED',
  ).length;
  const failed = normalized.filter((status) => status === 'FAILED').length;
  const active = normalized.filter(
    (status) => status === 'PENDING' || status === 'RUNNING',
  ).length;
  // Shares creditsForMockExecutionStatus with normalizeExecution so the
  // mocked summary agrees with the mocked executions' reported credits.
  const totalCredits = normalized.reduce(
    (sum, status) => sum + creditsForMockExecutionStatus(status),
    0,
  );

  return {
    active,
    completed,
    completedToday: 0,
    failed,
    failedToday: 0,
    total: executions.length,
    totalCredits,
  };
}

/**
 * Mock for workflow execution endpoints
 */
export async function mockWorkflowExecutions(
  page: Page,
  executions: Array<{
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    logs: string[];
    results: Record<string, unknown>;
  }> = [],
): Promise<void> {
  const workflowLabels = new Map(
    executions.map((execution) => [execution.workflowId, execution.workflowId]),
  );

  await routeApiPattern(page, '/workflow-executions**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === 'GET' && url.searchParams.get('view') === 'statistics') {
      await route.fulfill({
        body: JSON.stringify({ data: buildWorkflowExecutionStats(executions) }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'GET') {
      const resources = executions.map((execution) =>
        buildExecutionJsonApiResource(
          execution.id,
          normalizeExecution(
            execution,
            workflowLabels.get(execution.workflowId),
          ),
        ),
      );
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('workflow-execution', resources),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'POST') {
      const execution = normalizeExecution(
        {
          completedAt: null,
          id: 'exec-new',
          logs: ['Starting workflow execution...'],
          results: {},
          startedAt: new Date().toISOString(),
          status: 'running',
          workflowId: 'workflow-001',
        },
        'Social Media Pipeline',
      );
      await route.fulfill({
        body: JSON.stringify({
          data: buildExecutionJsonApiResource('exec-new', execution),
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, '/workflow-executions/*', async (route) => {
    const url = new URL(route.request().url());
    // `*` matches the query string, so the collection and statistics URLs
    // land here too. Those belong to the handler registered above.
    const id = url.pathname.match(/\/workflow-executions\/([^/]+)/)?.[1];
    if (!id) {
      await route.fallback();
      return;
    }
    const found = executions.find((execution) => execution.id === id);
    const execution = found || {
      completedAt: new Date().toISOString(),
      id,
      logs: ['Execution completed.'],
      results: { success: true },
      startedAt: new Date(Date.now() - 60000).toISOString(),
      status: 'completed',
      workflowId: 'workflow-001',
    };
    const normalized = normalizeExecution(execution, execution.workflowId);

    await route.fulfill({
      body: JSON.stringify({
        data: buildExecutionJsonApiResource(id, normalized),
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for workflow templates
 */
export async function mockWorkflowTemplates(
  page: Page,
  templates: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    nodeCount: number;
    thumbnailUrl: string;
  }> = [],
): Promise<void> {
  const workflowTemplates = templates.map((template) => ({
    category: template.category,
    description: template.description,
    icon: 'Sparkles',
    id: template.id,
    name: template.name,
    steps: buildTemplateSteps(template.nodeCount, template.id),
    thumbnailUrl: template.thumbnailUrl,
  }));

  await routeApiPattern(page, '/templates**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: workflowTemplates }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/workflows/templates**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: workflowTemplates }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // #2176 catalog-first install: templates page loads system catalog in parallel
  // with generation templates. Without this mock, Promise.all rejects and the
  // gallery renders "Failed to load templates" (nightly automation-loop).
  // Registered on the collection pattern because the catalog is a query filter
  // (#2225); everything else falls through to whatever workflow mock a spec
  // registered earlier — `mockWorkflowCrud` in every current caller.
  await routeApiPattern(page, '/workflows**', async (route) => {
    if (!isSystemCatalogRequest(route)) {
      await route.fallback();
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: workflowTemplates.map((template) => ({
            canonicalId: template.id,
            category: template.category,
            changeSummary: '',
            description: template.description,
            family: template.category,
            icon: template.icon,
            installable: true,
            installed: false,
            installedWorkflowId: null,
            isScheduleEnabled: false,
            label: template.name,
            sourceIssue: 0,
            version: 1,
          })),
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
}

/**
 * Mock for node type definitions
 */
export async function mockNodeTypes(
  page: Page,
  nodeTypes: Array<{
    type: string;
    label: string;
    category: string;
    description: string;
    inputs: string[];
    outputs: string[];
  }> = [],
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/node-types', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: nodeTypes.map((n) => ({
          attributes: n,
          id: n.type,
          type: 'node-types',
        })),
        meta: {
          totalCount: nodeTypes.length,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

// ----------------------------------------------------------------------------
// Brands Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for brands list data
 */
export async function mockBrandsData(page: Page, count = 3): Promise<void> {
  const brands = Array.from({ length: count }, (_, i) => ({
    attributes: {
      connectedAccounts: [
        {
          id: `account-${i}-1`,
          platform: 'instagram',
          username: `brand${i + 1}_ig`,
        },
        {
          id: `account-${i}-2`,
          platform: 'tiktok',
          username: `brand${i + 1}_tk`,
        },
      ],
      createdAt: new Date(
        Date.now() - i * 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      description: `Description for Brand ${i + 1}`,
      imageUrl: `https://cdn.genfeed.ai/mock/brands/brand-${i + 1}.png`,
      name: `Brand ${i + 1}`,
      slug: `brand-${i + 1}`,
    },
    id: `brand-${i + 1}`,
    type: 'brands',
  }));

  await page.route('**/api.genfeed.ai/v1/brands**', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (method === 'GET' && !url.match(/brands\/[^?]/)) {
      await route.fulfill({
        body: JSON.stringify({
          data: brands,
          meta: {
            page: 1,
            pageSize: count,
            totalCount: count,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (method === 'GET' && url.match(/brands\/[^?]/)) {
      await route.fulfill({
        body: JSON.stringify({ data: brands[0] }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (method === 'POST') {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              connectedAccounts: [],
              createdAt: new Date().toISOString(),
              description: 'New brand description',
              imageUrl: '',
              name: 'New Brand',
              slug: 'new-brand',
            },
            id: 'brand-new',
            type: 'brands',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });
}

/**
 * Mock for empty brands list
 */
export async function mockEmptyBrands(page: Page): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/brands**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 10, totalCount: 0 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Automation Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for automation overview data
 */
export async function mockAutomationData(page: Page): Promise<void> {
  const executionFixtures = [
    {
      completedAt: '2026-03-26T10:15:00.000Z',
      createdAt: '2026-03-26T10:00:00.000Z',
      creditsUsed: 6,
      durationMs: 18000,
      id: 'execution-1',
      inputValues: {},
      metadata: { label: 'Trend scan' },
      nodeResults: [
        {
          actionId: 'trends.scan',
          nodeId: 'node-1',
          status: 'COMPLETED',
        },
      ],
      organizationId: 'mock-org-id-e2e-test',
      progress: 100,
      startedAt: '2026-03-26T10:01:00.000Z',
      status: 'COMPLETED',
      trigger: 'MANUAL',
      updatedAt: '2026-03-26T10:15:00.000Z',
      userId: 'mock-user-id-e2e-test',
      workflow: { id: 'workflow-1', label: 'Trend scan' },
      workflowId: 'workflow-1',
    },
    {
      completedAt: '2026-03-26T08:15:00.000Z',
      createdAt: '2026-03-26T08:00:00.000Z',
      creditsUsed: 3,
      durationMs: 9000,
      id: 'execution-2',
      inputValues: {},
      metadata: { label: 'Caption draft' },
      nodeResults: [
        {
          actionId: 'captions.draft',
          nodeId: 'node-1',
          status: 'COMPLETED',
        },
      ],
      organizationId: 'mock-org-id-e2e-test',
      progress: 100,
      startedAt: '2026-03-26T08:01:00.000Z',
      status: 'COMPLETED',
      trigger: 'MANUAL',
      updatedAt: '2026-03-26T08:15:00.000Z',
      userId: 'mock-user-id-e2e-test',
      workflow: { id: 'workflow-2', label: 'Caption draft' },
      workflowId: 'workflow-2',
    },
  ];
  const now = new Date();
  const nowIso = now.toISOString();
  const oneDayAgoIso = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const twoDaysAgoIso = new Date(
    now.getTime() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  let createdAgentCampaign: Record<string, unknown> | undefined;

  await routeApiPattern(page, '/auth/bootstrap/overview**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        analytics: {
          activePlatforms: ['instagram', 'twitter', 'tiktok'],
          activeWorkflows: 2,
          pendingPosts: 3,
          totalPosts: 18,
          totalViews: 3200,
        },
        reviewInbox: {
          approvedCount: 1,
          changesRequestedCount: 1,
          pendingCount: 2,
          readyCount: 3,
          recentItems: [],
          rejectedCount: 0,
        },
        timeSeries: [
          { date: '2026-03-27', instagram: 40, tiktok: 20, twitter: 15 },
          { date: '2026-03-28', instagram: 55, tiktok: 26, twitter: 19 },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/workflow-executions**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const url = new URL(route.request().url());
    const query = (url.searchParams.get('q') ?? '').toLowerCase();

    const filteredExecutions = executionFixtures.filter((execution) => {
      if (!query) return true;
      return [execution.workflow.label, execution.id]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          'workflow-execution',
          filteredExecutions.map((execution) =>
            buildExecutionJsonApiResource(execution.id, execution),
          ),
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api.genfeed.ai/v1/bots**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: new Date().toISOString(),
                name: 'Content Bot',
                platform: 'instagram',
                status: 'active',
              },
              id: 'bot-1',
              type: 'bots',
            },
            {
              attributes: {
                createdAt: new Date().toISOString(),
                name: 'Engagement Bot',
                platform: 'tiktok',
                status: 'paused',
              },
              id: 'bot-2',
              type: 'bots',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api.genfeed.ai/v1/campaigns**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                endDate: new Date(
                  Date.now() + 14 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                name: 'Summer Campaign',
                postsCount: 24,
                startDate: new Date().toISOString(),
                status: 'active',
              },
              id: 'campaign-1',
              type: 'campaigns',
            },
            {
              attributes: {
                endDate: new Date().toISOString(),
                name: 'Product Launch',
                postsCount: 12,
                startDate: new Date(
                  Date.now() - 30 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                status: 'completed',
              },
              id: 'campaign-2',
              type: 'campaigns',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, '/agent-campaigns**', async (route) => {
    if (route.request().method() === 'GET') {
      const requestUrl = new URL(route.request().url());
      const detailMatch = requestUrl.pathname.match(
        /\/agent-campaigns\/([^/]+)$/,
      );

      if (requestUrl.pathname.endsWith('/status')) {
        const campaignId = requestUrl.pathname.split('/').at(-2) ?? '';
        await route.fulfill({
          body: JSON.stringify({
            agentsRunning: 0,
            campaignId,
            contentProduced: 0,
            creditsAllocated: 2000,
            creditsUsed: 0,
            status: 'draft',
          }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }

      if (detailMatch) {
        const detailId = detailMatch[1];
        const attributes =
          detailId === 'agent-campaign-created' && createdAgentCampaign
            ? createdAgentCampaign
            : {
                agents: ['strategy-1'],
                brief: 'Coordinate a multi-agent launch sequence.',
                brandId: 'brand-1',
                campaignLeadStrategyId: 'strategy-1',
                creditsAllocated: 2000,
                creditsUsed: 640,
                id: detailId,
                label: 'Launch Sprint',
                organization: 'mock-org-id-e2e-test',
                startDate: oneDayAgoIso,
                status: 'active',
                updatedAt: nowIso,
                user: 'mock-user-id-e2e-test',
              };

        await route.fulfill({
          body: JSON.stringify(
            buildJsonApiDocument('agent-campaigns', detailId, attributes),
          ),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('agent-campaigns', [
            {
              attributes: {
                agents: ['agent-1', 'agent-2'],
                brief: 'Coordinate a multi-agent launch sequence.',
                brandId: 'brand-1',
                campaignLeadStrategyId: 'strategy-1',
                creditsAllocated: 2000,
                creditsUsed: 640,
                endDate: new Date(
                  now.getTime() + 14 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                id: 'agent-campaign-1',
                label: 'Launch Sprint',
                organization: 'mock-org-id-e2e-test',
                startDate: oneDayAgoIso,
                status: 'active',
                updatedAt: nowIso,
                user: 'mock-user-id-e2e-test',
              },
              id: 'agent-campaign-1',
            },
          ]),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      createdAgentCampaign = {
        agents: ['strategy-1'],
        brief:
          typeof requestBody.brief === 'string' ? requestBody.brief : undefined,
        brandId:
          typeof requestBody.brandId === 'string'
            ? requestBody.brandId
            : 'brand-1',
        campaignLeadStrategyId: 'strategy-1',
        creditsAllocated:
          typeof requestBody.creditsAllocated === 'number'
            ? requestBody.creditsAllocated
            : 0,
        creditsUsed: 0,
        label:
          typeof requestBody.label === 'string'
            ? requestBody.label
            : 'Created Program',
        organization: 'mock-org-id-e2e-test',
        startDate:
          typeof requestBody.startDate === 'string'
            ? requestBody.startDate
            : nowIso,
        status: 'draft',
        updatedAt: nowIso,
        user: 'mock-user-id-e2e-test',
      };
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument(
            'agent-campaigns',
            'agent-campaign-created',
            createdAgentCampaign,
          ),
        ),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await routeApiPattern(page, '/agent-strategies**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('agent-strategies', [
            {
              attributes: {
                agentType: 'content',
                autonomyMode: 'autopilot',
                autoPublishConfidenceThreshold: 82,
                consecutiveFailures: 0,
                createdAt: twoDaysAgoIso,
                creditsUsedThisWeek: 140,
                creditsUsedToday: 24,
                dailyCreditBudget: 100,
                dailyCreditResetAt: new Date(
                  now.getTime() + 8 * 60 * 60 * 1000,
                ).toISOString(),
                dailyCreditsUsed: 24,
                displayRole: 'Instagram Short Creator',
                engagementKeywords: ['launch', 'growth'],
                engagementTone: 'supportive',
                id: 'strategy-1',
                isActive: true,
                isEnabled: true,
                isEngagementEnabled: true,
                label: 'Growth Autopilot',
                lastRunAt: oneDayAgoIso,
                maxEngagementsPerDay: 15,
                model: 'gpt-5.4',
                nextRunAt: new Date(
                  now.getTime() + 6 * 60 * 60 * 1000,
                ).toISOString(),
                platforms: ['instagram', 'tiktok'],
                postsPerWeek: 12,
                preferredPostingTimes: ['09:00', '15:00'],
                qualityTier: 'balanced',
                reportsToLabel: 'Main Orchestrator',
                requiresManualReactivation: false,
                runFrequency: 'daily',
                runHistory: [
                  {
                    completedAt: nowIso,
                    contentGenerated: 4,
                    creditsUsed: 18,
                    startedAt: oneDayAgoIso,
                    status: 'completed',
                    threadId: 'thread-1',
                  },
                  {
                    completedAt: new Date(
                      now.getTime() - 18 * 60 * 60 * 1000,
                    ).toISOString(),
                    contentGenerated: 2,
                    creditsUsed: 12,
                    startedAt: new Date(
                      now.getTime() - 18.2 * 60 * 60 * 1000,
                    ).toISOString(),
                    status: 'failed',
                  },
                ],
                teamGroup: 'Production',
                timezone: 'UTC',
                topics: ['launches', 'audience growth', 'content ops'],
                updatedAt: nowIso,
                voice: 'friendly',
                weeklyCreditBudget: 700,
              },
              id: 'strategy-1',
            },
          ]),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('agent-strategies', 'strategy-created', {
            agentType:
              typeof requestBody.agentType === 'string'
                ? requestBody.agentType
                : 'general',
            autonomyMode:
              typeof requestBody.autonomyMode === 'string'
                ? requestBody.autonomyMode
                : 'supervised',
            creditsUsedToday: 0,
            dailyCreditBudget:
              typeof requestBody.dailyCreditBudget === 'number'
                ? requestBody.dailyCreditBudget
                : 0,
            dailyCreditsUsed: 0,
            displayRole:
              typeof requestBody.displayRole === 'string'
                ? requestBody.displayRole
                : undefined,
            isActive:
              typeof requestBody.isActive === 'boolean'
                ? requestBody.isActive
                : true,
            isEnabled: true,
            label:
              typeof requestBody.label === 'string'
                ? requestBody.label
                : 'Created Strategy',
            platforms: Array.isArray(requestBody.platforms)
              ? requestBody.platforms
              : [],
            postsPerWeek:
              typeof requestBody.postsPerWeek === 'number'
                ? requestBody.postsPerWeek
                : 7,
            reportsToLabel:
              typeof requestBody.reportsToLabel === 'string'
                ? requestBody.reportsToLabel
                : undefined,
            runFrequency:
              typeof requestBody.runFrequency === 'string'
                ? requestBody.runFrequency
                : 'daily',
            teamGroup:
              typeof requestBody.teamGroup === 'string'
                ? requestBody.teamGroup
                : undefined,
            topics: Array.isArray(requestBody.topics) ? requestBody.topics : [],
            updatedAt: nowIso,
            weeklyCreditBudget:
              typeof requestBody.weeklyCreditBudget === 'number'
                ? requestBody.weeklyCreditBudget
                : 0,
          }),
        ),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await routeApiPattern(page, '/agent/goals**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify([
          {
            brand: 'brand-1',
            currentValue: 120000,
            id: 'goal-1',
            isActive: true,
            label: 'April Views Goal',
            metric: 'views',
            progressPercent: 48,
            targetValue: 250000,
          },
        ]),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        body: JSON.stringify({
          brand:
            typeof requestBody.brand === 'string'
              ? requestBody.brand
              : undefined,
          currentValue: 0,
          description:
            typeof requestBody.description === 'string'
              ? requestBody.description
              : undefined,
          id: 'goal-created',
          isActive:
            typeof requestBody.isActive === 'boolean'
              ? requestBody.isActive
              : true,
          label:
            typeof requestBody.label === 'string'
              ? requestBody.label
              : 'Created Goal',
          metric:
            typeof requestBody.metric === 'string'
              ? requestBody.metric
              : 'views',
          progressPercent: 0,
          targetValue:
            typeof requestBody.targetValue === 'number'
              ? requestBody.targetValue
              : 0,
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api.genfeed.ai/v1/reply-bots**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                name: 'FAQ Reply Bot',
                repliesCount: 156,
                status: 'active',
              },
              id: 'reply-bot-1',
              type: 'reply-bots',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 1 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api.genfeed.ai/v1/tasks**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                dueDate: new Date(
                  Date.now() + 2 * 24 * 60 * 60 * 1000,
                ).toISOString(),
                name: 'Schedule Posts',
                status: 'pending',
              },
              id: 'task-1',
              type: 'tasks',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 1 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

export async function mockOrganizationIdentityDefaults(page: Page): Promise<{
  avatars: {
    fallback: MockAvatarIdentityFixture;
    source: MockAvatarIdentityFixture;
    video: MockAvatarIdentityFixture;
  };
}> {
  const avatars = {
    fallback: buildAvatarIdentityFixture({
      id: 'avatar-source-fallback',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/avatars/fallback.jpg',
      label: 'Fallback Avatar',
    }),
    source: buildAvatarIdentityFixture({
      id: 'avatar-source-1',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/avatars/source-1.jpg',
      label: 'Avatar Source One',
    }),
    video: buildAvatarIdentityFixture({
      extension: 'mp4',
      id: 'avatar-video-1',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/avatars/video-1.mp4',
      label: 'Avatar Video One',
      parent: 'avatar-source-1',
      thumbnailUrl: 'https://cdn.genfeed.ai/mock/avatars/video-1-thumb.jpg',
    }),
  };

  const voices = [
    buildVoiceDocument('voice-1', 'Narrator', 'elevenlabs'),
    buildVoiceDocument('voice-2', 'Guide', 'heygen'),
  ];

  let settings = {
    defaultAvatarIngredientId: avatars.fallback.id,
    defaultVoiceId: 'voice-1',
    defaultVoiceRef: {
      provider: 'elevenlabs',
      voiceId: 'voice-1-external',
    },
    id: 'org-settings-1',
  };

  await routeUsersPattern(page, '/me/brands**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: {
              id: 'brand-1',
              imageUrl: 'https://cdn.genfeed.ai/mock/brands/brand-1.png',
              label: 'Brand 1',
              name: 'Brand 1',
            },
            id: 'brand-1',
            type: 'brand',
          },
        ],
        meta: {
          page: 1,
          pageSize: 1,
          totalCount: 1,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/organizations/**/settings**', async (route) => {
    const method = route.request().method();

    if (method === 'PATCH' || method === 'PUT') {
      settings = {
        ...settings,
        ...extractRequestPayload(route),
      };
    }

    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: settings,
          id: settings.id,
          type: 'organization-settings',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Organization settings also ship in the protected bootstrap payload, which
  // BrandProvider reads first. Serve the same mutable settings there so the
  // post-save refresh goes through the production bootstrap path (#5416).
  await routeApiPattern(page, '/auth/bootstrap**', async (route) => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    await route.fulfill({
      body: JSON.stringify({
        ...bootstrap,
        settings: { ...bootstrap.settings, ...settings },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(
    page,
    '/organizations/**/ingredients**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify(
          buildAvatarIngredientCollection([
            avatars.source,
            avatars.fallback,
            avatars.video,
          ]),
        ),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  await routeApiPattern(page, '/voices**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: voices,
        meta: { page: 1, pageSize: voices.length, totalCount: voices.length },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return { avatars };
}

export async function mockBrandIdentityDefaults(page: Page): Promise<{
  avatars: {
    fallback: MockAvatarIdentityFixture;
    source: MockAvatarIdentityFixture;
    video: MockAvatarIdentityFixture;
  };
}> {
  const { avatars } = await mockOrganizationIdentityDefaults(page);

  let brand = {
    agentConfig: {
      defaultAvatarIngredientId: null,
      defaultVoiceId: null,
      defaultVoiceRef: null,
    },
    createdAt: new Date().toISOString(),
    credentials: [],
    description: 'Brand detail fixture',
    id: 'brand-1',
    imageUrl: 'https://cdn.genfeed.ai/mock/brands/brand-1.png',
    label: 'Brand 1',
    links: [],
    name: 'Brand 1',
    scope: 'private',
    slug: 'brand-1',
    updatedAt: new Date().toISOString(),
  };

  await routeUsersPattern(page, '/me/brands**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: brand,
            id: brand.id,
            type: 'brand',
          },
        ],
        meta: {
          page: 1,
          pageSize: 1,
          totalCount: 1,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/brands/brand-1', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: brand,
          id: brand.id,
          type: 'brand',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // useBrandDetail's findOneBrand (both the initial load and every
  // handleRefreshBrand() after a save) calls BrandsService.findOneBySlug(),
  // which hits `GET /brands/slug?slug=...` — a different path than
  // `/brands/brand-1` above. Without this, every refresh silently falls
  // through to setupApiMocks' generic empty-collection fallback, so a saved
  // agentConfig change never reaches the UI.
  await routeApiPattern(page, '/brands/slug**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: brand,
          id: brand.id,
          type: 'brand',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/brands/brand-1/agent-config', async (route) => {
    brand = {
      ...brand,
      agentConfig: {
        ...brand.agentConfig,
        ...extractRequestPayload(route),
      },
    };

    await route.fulfill({
      body: JSON.stringify({ success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/public/videos**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/public/images**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/public/articles**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return { avatars };
}

export async function mockAvatarIngredientActions(page: Page): Promise<{
  avatars: {
    source: MockAvatarIdentityFixture;
    video: MockAvatarIdentityFixture;
  };
}> {
  const avatars = {
    source: buildAvatarIdentityFixture({
      id: 'avatar-source-action',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/avatars/action-source.jpg',
      label: 'Avatar Action Source',
    }),
    video: buildAvatarIdentityFixture({
      extension: 'mp4',
      id: 'avatar-video-action',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/avatars/action-video.mp4',
      label: 'Avatar Action Video',
      parent: 'avatar-source-action',
      thumbnailUrl:
        'https://cdn.genfeed.ai/mock/avatars/action-video-thumb.jpg',
    }),
  };

  await mockOrganizationIdentityDefaults(page);

  await routeApiPattern(page, '/folders**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { page: 1, pageSize: 0, totalCount: 0 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  const avatarIngredientsListBody = JSON.stringify(
    buildAvatarIngredientCollection([avatars.source, avatars.video]),
  );

  await routeApiPattern(
    page,
    '/organizations/**/ingredients**',
    async (route) => {
      await route.fulfill({
        body: avatarIngredientsListBody,
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // The Library's own asset list (LibraryAssetsPage, PageScope.BRAND) does not
  // go through OrganizationsService at all — useIngredientsList's non-org
  // branch calls IngredientsService (`/ingredients`, brand-scoped by auth
  // context, not a path segment). The org-scoped mock above never matches
  // that request. Only the list pathname is answered here; sub-resources such
  // as `/ingredients/summary` get their own contract below.
  await routeApiPattern(page, '/ingredients**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (
      route.request().method() !== 'GET' ||
      !/\/ingredients$/.test(pathname)
    ) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: avatarIngredientsListBody,
      contentType: 'application/json',
      status: 200,
    });
  });

  // LibrarySidebarNav's counters (useLibrarySummary): plain ILibrarySummary,
  // not JSON:API. Both seeded avatars are GENERATED, unfoldered and PENDING
  // review, so each counts on Unsorted and on Needs review.
  const avatarLibrarySummary: ILibrarySummary = {
    byCategory: { [IngredientCategory.AVATAR]: 2 },
    byShelf: {
      [LibraryShelf.APPROVED]: 0,
      [LibraryShelf.ARCHIVED]: 0,
      [LibraryShelf.FAILED]: 0,
      [LibraryShelf.GENERATING]: 0,
      [LibraryShelf.NEEDS_REVIEW]: 2,
      [LibraryShelf.UNSORTED]: 2,
    },
    starredCount: 0,
    storageBytes: 0,
    total: 2,
    trashedCount: 0,
  };

  await routeApiPattern(page, '/ingredients/summary**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(avatarLibrarySummary),
      contentType: 'application/json',
      status: 200,
    });
  });

  const avatarPatchHandler = async (route: Route) => {
    const isVideo = route.request().url().includes(avatars.video.id);
    const current = isVideo ? avatars.video : avatars.source;
    const nextCategory = String(
      extractRequestPayload(route).category ?? 'avatar',
    );

    const updated = {
      ...current,
      extension:
        nextCategory === 'image' ? ('jpg' as const) : current.extension,
    };

    await route.fulfill({
      body: JSON.stringify({
        data: buildAvatarIngredientDocument(updated),
        included: [buildAvatarMetadataResource(updated)],
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/avatar/**', avatarPatchHandler);
  await page.route('**/api.genfeed.ai/v1/avatars/**', avatarPatchHandler);
  await page.route(`${LOCAL_API}/avatar/**`, avatarPatchHandler);
  await page.route(`${LOCAL_API}/avatars/**`, avatarPatchHandler);

  return { avatars };
}

// ----------------------------------------------------------------------------
// Library Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for library content data
 */
export async function mockLibraryData(page: Page): Promise<void> {
  const fulfillCaptions = async (route: Route): Promise<void> => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                content: 'Engaging caption for social media',
                createdAt: new Date().toISOString(),
                platform: 'instagram',
              },
              id: 'caption-1',
              type: 'captions',
            },
            {
              attributes: {
                content: 'Trending hashtag caption',
                createdAt: new Date().toISOString(),
                platform: 'tiktok',
              },
              id: 'caption-2',
              type: 'captions',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  };

  await page.route('**/api.genfeed.ai/v1/captions**', fulfillCaptions);
  await page.route('**/v1/captions**', fulfillCaptions);

  // The Library browser filters on one unified `/ingredients` endpoint and puts
  // the asset type on the query string (`categories=MUSIC`). A fixture that
  // answered every request with the same photo made `/library/music` render an
  // image row, so honour the category axis the way the API does.
  const libraryIngredients = [
    {
      category: IngredientCategory.IMAGE,
      cdnUrl: 'https://cdn.genfeed.ai/mock/ingredient.jpg',
      id: 'ingredient-image-1',
      metadata: { label: 'Product Photo' },
    },
    {
      category: IngredientCategory.VIDEO,
      cdnUrl: 'https://cdn.genfeed.ai/mock/clip.mp4',
      id: 'ingredient-video-1',
      metadata: { label: 'Launch Teaser' },
    },
    {
      category: IngredientCategory.GIF,
      cdnUrl: 'https://cdn.genfeed.ai/mock/loop.gif',
      id: 'ingredient-gif-1',
      metadata: { label: 'Reaction Loop' },
    },
    {
      category: IngredientCategory.MUSIC,
      cdnUrl: 'https://cdn.genfeed.ai/mock/theme.mp3',
      id: 'ingredient-music-1',
      metadata: { label: 'Ambient Loop' },
    },
    {
      category: IngredientCategory.VOICE,
      cdnUrl: 'https://cdn.genfeed.ai/mock/narrator.wav',
      id: 'ingredient-voice-1',
      metadata: { label: 'Narrator Take' },
    },
  ];

  const fulfillIngredients = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const searchParams = new URL(route.request().url()).searchParams;
    const requestedCategories = new Set(
      [...searchParams.getAll('categories'), ...searchParams.getAll('category')]
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    );

    const matched =
      requestedCategories.size === 0
        ? libraryIngredients
        : libraryIngredients.filter((ingredient) =>
            requestedCategories.has(ingredient.category),
          );

    await route.fulfill({
      body: JSON.stringify({
        data: matched.map(({ id, ...attributes }) => ({
          attributes: {
            ...attributes,
            createdAt: new Date().toISOString(),
            status: 'UPLOADED',
          },
          id,
          type: 'ingredients',
        })),
        meta: { page: 1, pageSize: 10, totalCount: matched.length },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/ingredients**', fulfillIngredients);
  await page.route('**/v1/ingredients**', fulfillIngredients);

  await page.route('**/api.genfeed.ai/v1/scenes**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: new Date().toISOString(),
                duration: 15,
                name: 'Intro Scene',
                thumbnailUrl: 'https://cdn.genfeed.ai/mock/scene-thumb.jpg',
              },
              id: 'scene-1',
              type: 'scenes',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 1 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api.genfeed.ai/v1/trainings**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                completedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                name: 'Brand Voice Training',
                status: 'completed',
              },
              id: 'training-1',
              type: 'trainings',
            },
          ],
          meta: { page: 1, pageSize: 10, totalCount: 1 },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

// ----------------------------------------------------------------------------
// Error Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for network errors
 */
/** True only for a request actually bound for the mocked backend API. */
function isApiRequest(url: string): boolean {
  try {
    return new URL(url).origin === playwrightApiOrigin;
  } catch {
    return false;
  }
}

export async function mockNetworkError(
  page: Page,
  urlPattern: string,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    const request = route.request();
    // The glob (e.g. "**/posts**") also matches two request shapes besides
    // the intended background API call: the page's own document navigation,
    // and the App Router's RSC payload fetch for that same route -- both go
    // to the app's own origin, never the API's. Aborting either forces
    // net::ERR_FAILED or Next's own "failed to fetch RSC payload -> fall
    // back to a hard reload" recovery loop instead of letting the surface
    // render its own handled error/empty state. See #5381.
    if (!isApiRequest(request.url())) {
      await route.continue();
      return;
    }
    await route.abort('failed');
  });
}

/**
 * Mock for server errors
 */
export async function mockServerError(
  page: Page,
  urlPattern: string,
  statusCode = 500,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    const request = route.request();
    // Same scoping as mockNetworkError: the glob also matches the page's own
    // document navigation and RSC fetch when the route path shares the
    // keyword (e.g. /publishing/posts). Fulfilling those with an error JSON
    // body would let the document "succeed" with the wrong content instead
    // of exercising the app's own handled API-error state. See #5381.
    if (!isApiRequest(request.url())) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            detail: 'An unexpected error occurred. Please try again later.',
            status: statusCode.toString(),
            title: 'Internal Server Error',
          },
        ],
      }),
      contentType: 'application/json',
      status: statusCode,
    });
  });
}

// ----------------------------------------------------------------------------
// Posts & Calendar Mocks
// ----------------------------------------------------------------------------

/**
 * Mock post data generator
 */
export function generateMockPost(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = (overrides.id as string) || `mock-post-${Date.now()}`;
  const now = new Date().toISOString();
  return {
    avgEngagementRate: 0,
    brand: 'mock-brand-id',
    category: 'text',
    children: [],
    createdAt: now,
    description: 'This is a mock post description for E2E testing.',
    evalScore: null,
    id,
    ingredients: [],
    label: 'Mock Post Title',
    organization: 'mock-org-id-e2e-test',
    platform: 'twitter',
    platformUrl: null,
    scheduledDate: null,
    status: PostStatus.DRAFT,
    totalComments: 0,
    totalLikes: 0,
    totalViews: 0,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Mock for posts list (drafts, scheduled, published)
 */
export async function mockPostsList(
  page: Page,
  posts?: Record<string, unknown>[],
  options: MockOptions = {},
): Promise<void> {
  const { delay = 0, status = 200 } = options;
  const mockPosts = posts || [
    generateMockPost({
      description: 'First draft post content',
      id: 'post-draft-001',
      label: 'Draft Post 1',
      status: PostStatus.DRAFT,
    }),
    generateMockPost({
      description: 'Second draft post content',
      id: 'post-draft-002',
      label: 'Draft Post 2',
      status: PostStatus.DRAFT,
    }),
    generateMockPost({
      description: 'Scheduled for next week',
      id: 'post-sched-001',
      label: 'Scheduled Post 1',
      scheduledDate: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: PostStatus.SCHEDULED,
    }),
    generateMockPost({
      description: 'Already published post',
      id: 'post-pub-001',
      label: 'Published Post 1',
      platformUrl: 'https://twitter.com/mock/status/123',
      status: PostStatus.PUBLIC,
      totalComments: 12,
      totalLikes: 45,
      totalViews: 230,
    }),
  ];

  const fulfillPosts = async (route: Route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const url = route.request().url();
    const urlObj = new URL(url);
    const statusFilter = urlObj.searchParams.get('status');
    const searchFilter = urlObj.searchParams.get('search');

    let filtered = [...mockPosts];
    if (statusFilter) {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }
    if (searchFilter) {
      filtered = filtered.filter(
        (p) =>
          ((p.label as string) || '')
            .toLowerCase()
            .includes(searchFilter.toLowerCase()) ||
          ((p.description as string) || '')
            .toLowerCase()
            .includes(searchFilter.toLowerCase()),
      );
    }

    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          'post',
          filtered.map((post) => ({
            attributes: buildPostAttributes(post),
            id: String(post.id),
          })),
        ),
      ),
      contentType: 'application/json',
      status,
    });
  };

  await page.route('**/api.genfeed.ai/v1/brands/*/posts**', fulfillPosts);
  await page.route(`${LOCAL_API}/brands/*/posts**`, fulfillPosts);
  await routeApiPattern(page, '/posts**', fulfillPosts);
}

/**
 * Mock for the newsletters collection (`GET /newsletters`), matching
 * `newsletterSerializerConfig` (`type: 'newsletter'`, flat attributes --
 * no relationships).
 */
export async function mockNewslettersList(
  page: Page,
  newsletters: Array<{
    id: string;
    label: string;
    status?: string;
    summary?: string;
    topic?: string;
    createdAt?: string;
    scheduledFor?: string | null;
  }>,
): Promise<void> {
  await routeApiPattern(page, '/newsletters**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const now = new Date().toISOString();
    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          'newsletter',
          newsletters.map((newsletter) => ({
            attributes: {
              approvedAt: null,
              content: '',
              createdAt: newsletter.createdAt ?? now,
              isDeleted: false,
              label: newsletter.label,
              publishedAt: null,
              scheduledFor: newsletter.scheduledFor ?? null,
              status: newsletter.status ?? 'draft',
              summary: newsletter.summary ?? '',
              topic: newsletter.topic ?? '',
              updatedAt: now,
            },
            id: newsletter.id,
          })),
        ),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for single post detail
 */
export async function mockPostDetail(
  page: Page,
  post?: Record<string, unknown>,
): Promise<void> {
  const mockPost =
    post ||
    generateMockPost({
      description: 'Detailed post content for testing',
      id: 'post-detail-001',
      label: 'Detailed Post',
      status: PostStatus.DRAFT,
    });

  await routeApiPattern(page, '/posts/*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const payload = buildPostAttributes(mockPost);
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('post', String(mockPost.id), payload),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'PATCH' || method === 'PUT') {
      const payload = {
        ...buildPostAttributes(mockPost),
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('post', String(mockPost.id), payload),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

/**
 * Post lifecycle status -> release/target status. `ReleaseStatus` and
 * `TargetExecutionState` share the same string values for every state a
 * mocked calendar item needs; PostStatus.PUBLIC is the one label that
 * diverges from its release-group equivalent ('published').
 */
function toReleaseStatus(status: unknown): string {
  return status === PostStatus.PUBLIC ? 'published' : String(status ?? 'draft');
}

/**
 * Builds the one channel-target a mocked release fans out to, matching
 * `channel-target.attributes.ts` (`packages/serializers`). Returned
 * alongside its id so callers can wire the matching
 * `relationships.targets.data` entry -- see `buildReleaseGroupDocument`.
 */
function buildChannelTargetResource(
  post: Record<string, unknown>,
  groupId: string,
  overrides: { id?: string; status?: string; scheduledAt?: string | null } = {},
): { id: string; attributes: Omit<IChannelTarget, 'id'> } {
  const id = overrides.id ?? String(post.id);
  const status = overrides.status ?? toReleaseStatus(post.status);
  const scheduledAt =
    overrides.scheduledAt !== undefined
      ? overrides.scheduledAt
      : ((post.scheduledDate as string | null) ?? null);

  // Mirrors `PostGroupContractService.toChannelTarget` for a manual target
  // that passed validation and has no analytics collected yet.
  const target: IChannelTarget = {
    analytics: {
      collection: {
        capability: TargetAnalyticsCapability.SUPPORTED,
        error: null,
        freshness: TargetAnalyticsFreshness.UNAVAILABLE,
        lastCollectedAt: null,
        requestedAt: null,
        state: TargetAnalyticsCollectionState.UNAVAILABLE,
      },
      snapshot: null,
      state: 'unavailable',
    },
    attachments: [],
    category: PostCategory.TEXT,
    createdAt: '2026-01-01T00:00:00.000Z',
    credentialId: `mock-credential-${id}`,
    error: null,
    executionState: status as TargetExecutionState,
    externalProviderId: null,
    externalShortcode: null,
    id,
    idempotencyKey: null,
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: ((post.platform as string) ?? 'twitter') as CredentialPlatform,
    publishedAt: status === 'published' ? scheduledAt : null,
    readiness: null,
    // The parent release group's id, never the target's own.
    releaseId: groupId,
    retryCount: 0,
    scheduledAt,
    settings: {},
    source: ReleaseTargetSource.MANUAL,
    statusTransitions: [],
    timezone: 'America/New_York',
    updatedAt: '2026-01-01T00:00:00.000Z',
    url: null,
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    visibility: PostVisibility.PUBLIC,
    workflowExecutionId: null,
  };
  const { id: _id, ...attributes } = target;

  return { attributes, id };
}

/**
 * Builds a JSON:API `release-group` *attributes* payload -- `targets` is
 * deliberately absent here: it is a relationship, never an attribute (see
 * `buildReleaseGroupDocument`). `ContentCalendarPage` reads releases from
 * `ReleaseGroupsService` (`GET /post-groups`), never `/posts` -- the
 * calendar has no post-level data source. See #5381.
 */
function buildReleaseGroupAttributes(
  post: Record<string, unknown>,
  groupId: string,
  targets: Array<{ id: string; attributes: Omit<IChannelTarget, 'id'> }>,
  overrides: { status?: string; scheduledAt?: string | null } = {},
): Record<string, unknown> {
  const status = overrides.status ?? toReleaseStatus(post.status);
  const scheduledAt =
    overrides.scheduledAt !== undefined
      ? overrides.scheduledAt
      : ((post.scheduledDate as string | null) ?? null);

  // `attachments` and `recurrence` are absent on purpose: both are
  // `release-group.config.ts` relationships (`rel('release-attachment',
  // ...)` / `rel('recurrence-rule', ...)`), never attributes -- wired into
  // `data.relationships` by `buildReleaseGroupDocument` /
  // `buildReleaseGroupCollectionDocument` instead.
  return {
    analyticsComparison: buildReleaseAnalyticsComparison(
      groupId,
      targets.map(
        (target) =>
          ({
            ...target.attributes,
            id: target.id,
          }) as unknown as IChannelTarget,
      ),
    ),
    baseContent: (post.description as string) || '',
    campaignId: null,
    media: [],
    ownerId: 'mock-user-id-e2e-test',
    publishedAt: status === 'published' ? scheduledAt : null,
    scheduledAt,
    status,
    statusTransitions: [],
    targetSummary: { total: 1, [status]: 1 },
    timezone: 'America/New_York',
    title: (post.label as string) || 'Untitled post',
  };
}

/**
 * Builds a serializer-faithful `release-group` JSON:API document. The real
 * `ReleaseGroupSerializer` (`release-group.config.ts`'s `targets:
 * nestedRel('channel-target', ...)`) emits `targets` as a
 * `relationships.targets` reference plus a sideloaded `included`
 * `channel-target` resource, never as a plain attribute -- embedding
 * `targets` directly under `attributes` (the pre-review shape here) skips
 * the client's relationship-deserialization path entirely. See #5381.
 */
function buildReleaseGroupDocument(
  id: string,
  attributes: Record<string, unknown>,
  targets: Array<{ id: string; attributes: Omit<IChannelTarget, 'id'> }>,
) {
  return {
    data: {
      attributes,
      id,
      relationships: {
        // Both empty on every mocked release: no fixture here attaches
        // files or sets up a recurrence rule. Still real relationships,
        // not attributes -- see `buildReleaseGroupAttributes`.
        attachments: { data: [] },
        recurrence: { data: null },
        targets: {
          data: targets.map((target) => ({
            id: target.id,
            type: 'channel-target',
          })),
        },
      },
      type: 'release-group',
    },
    included: targets.map((target) => ({
      attributes: target.attributes,
      id: target.id,
      type: 'channel-target',
    })),
  };
}

/**
 * Same relationships-plus-`included` shape as `buildReleaseGroupDocument`,
 * for a `GET /post-groups` collection response: one shared `included`
 * array backs every release's `targets` relationship.
 */
function buildReleaseGroupCollectionDocument(
  releases: Array<{
    id: string;
    attributes: Record<string, unknown>;
    targets: Array<{ id: string; attributes: Omit<IChannelTarget, 'id'> }>;
  }>,
) {
  const included: Array<{
    attributes: Record<string, unknown>;
    id: string;
    type: string;
  }> = [];

  const data = releases.map((release) => {
    for (const target of release.targets) {
      included.push({
        attributes: target.attributes,
        id: target.id,
        type: 'channel-target',
      });
    }
    return {
      attributes: release.attributes,
      id: release.id,
      relationships: {
        attachments: { data: [] },
        recurrence: { data: null },
        targets: {
          data: release.targets.map((target) => ({
            id: target.id,
            type: 'channel-target',
          })),
        },
      },
      type: 'release-group',
    };
  });

  return {
    data,
    included,
    meta: { page: 1, pageSize: data.length, totalCount: data.length },
  };
}

/**
 * Mock for the calendar's release-group endpoint (`GET /post-groups`).
 *
 * Defaults schedule across Monday/Wednesday/Friday of the *current* week so
 * they land inside `ContentCalendarPage`'s default week view without the
 * caller needing to know today's date. Pass `posts` (same
 * `generateMockPost` fixtures used elsewhere) to control exact placement --
 * e.g. compute dates from the browser's own `Date` (see
 * `currentWeekBrowserDates` in scheduling.spec.ts) so they always agree with
 * whatever "now" the app itself resolves to.
 */
export async function mockCalendarPosts(
  page: Page,
  posts?: Record<string, unknown>[],
): Promise<void> {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const at = (offsetDays: number, hour: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offsetDays);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const mockPosts = posts || [
    generateMockPost({
      description: 'Monday morning post',
      id: 'cal-post-001',
      label: 'Calendar Post 1',
      platform: 'twitter',
      scheduledDate: at(0, 9),
      status: PostStatus.SCHEDULED,
    }),
    generateMockPost({
      description: 'Midweek content',
      id: 'cal-post-002',
      label: 'Calendar Post 2',
      platform: 'instagram',
      scheduledDate: at(2, 14),
      status: PostStatus.SCHEDULED,
    }),
    generateMockPost({
      description: 'Published earlier this week',
      id: 'cal-post-003',
      label: 'Calendar Post 3',
      platform: 'youtube',
      scheduledDate: at(0, 12),
      status: PostStatus.PUBLIC,
    }),
    generateMockPost({
      description: 'Draft scheduled for Friday',
      id: 'cal-post-004',
      label: 'Calendar Post 4',
      platform: 'linkedin',
      scheduledDate: at(4, 10),
      status: PostStatus.DRAFT,
    }),
  ];

  await routeApiPattern(page, '/post-groups**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildReleaseGroupCollectionDocument(
            mockPosts.map((post) => {
              const releaseId = String(post.id);
              const targets = [buildChannelTargetResource(post, releaseId)];
              return {
                attributes: buildReleaseGroupAttributes(
                  post,
                  releaseId,
                  targets,
                ),
                id: releaseId,
                targets,
              };
            }),
          ),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, '/articles**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(buildJsonApiCollection('articles', [])),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

/**
 * Mock for post publishing / scheduling.
 *
 * A lone draft post has no release group yet: `usePostDetail`'s
 * `handleScheduleSave` / `handlePublishNow` first call
 * `ReleaseGroupsService.ensureFromPost(postId)` (`POST /post-groups/from-post`)
 * to get one, then mutate the target via `scheduleTarget` / `publishTargetNow`
 * (`PATCH /post-groups/:groupId/targets/:targetId`, body
 * `{ action, scheduledDate? }`). There is no `/posts/:id/status` or
 * `/posts/:id/schedule` endpoint.
 *
 * Pass `post` for a fully stateful mock: the release group id is derived
 * from the post id, and once the schedule/publish PATCH lands, the mocked
 * `GET /posts/:id` refetch reflects the new status and `scheduledAt` --
 * exactly what `commitSchedule`'s `fetchPost(true)` observes after a real
 * save. See #5381.
 */
export async function mockPostPublishing(
  page: Page,
  options: MockOptions & { post?: Record<string, unknown> } = {},
): Promise<void> {
  const { delay = 0, post } = options;
  const postId = post ? String(post.id) : null;
  const groupId = postId ? `mock-release-${postId}` : null;
  const state: { scheduledAt: string | null; status: string } = {
    scheduledAt: post ? ((post.scheduledDate as string | null) ?? null) : null,
    status: post ? toReleaseStatus(post.status) : 'draft',
  };

  await routeApiPattern(page, '/post-groups/from-post', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const body = route.request().postDataJSON() as
      | { postId?: string }
      | undefined;
    const requestedPostId = body?.postId || postId || 'mock-post-id';
    const resolvedGroupId = groupId ?? `mock-release-${requestedPostId}`;
    const source = post ?? { id: requestedPostId, status: 'draft' };
    const target = buildChannelTargetResource(source, resolvedGroupId, {
      id: requestedPostId,
      ...state,
    });
    // `ensureReleaseForPost` creates the group with no release-wide date and
    // `schedulePostGroupTarget` only schedules the target, so the group's
    // `scheduledAt` stays null.
    const attributes = buildReleaseGroupAttributes(
      source,
      resolvedGroupId,
      [target],
      { scheduledAt: null, status: state.status },
    );
    await route.fulfill({
      body: JSON.stringify(
        buildReleaseGroupDocument(resolvedGroupId, attributes, [target]),
      ),
      contentType: 'application/json',
      status: 201,
    });
  });

  await routeApiPattern(page, '/post-groups/*/targets/*', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const body = route.request().postDataJSON() as
      | { action?: string; scheduledDate?: string }
      | undefined;
    // `publishTargetNow` schedules the target for now and enqueues execution,
    // so both actions answer with a scheduled release; completion comes later.
    const isPublishNow = body?.action?.startsWith('publish') ?? false;
    if (body?.action === 'schedule' || isPublishNow) {
      state.status = 'scheduled';
      state.scheduledAt = isPublishNow
        ? new Date().toISOString()
        : (body?.scheduledDate ?? state.scheduledAt);
    }

    const segments = new URL(route.request().url()).pathname.split('/');
    const requestedGroupId = segments.at(-3) || groupId || 'mock-release-group';
    const requestedTargetId = segments.at(-1) || postId || 'mock-target-id';
    const source = post ?? { id: requestedTargetId, status: state.status };
    const target = buildChannelTargetResource(source, requestedGroupId, {
      id: requestedTargetId,
      ...state,
    });
    // `ensureReleaseForPost` creates the group with no release-wide date and
    // `schedulePostGroupTarget` only schedules the target, so the group's
    // `scheduledAt` stays null.
    const attributes = buildReleaseGroupAttributes(
      source,
      requestedGroupId,
      [target],
      { scheduledAt: null, status: state.status },
    );
    await route.fulfill({
      body: JSON.stringify(
        buildReleaseGroupDocument(requestedGroupId, attributes, [target]),
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  if (post && postId) {
    await routeApiPattern(page, `/posts/${postId}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      const payload = buildPostAttributes({
        ...post,
        scheduledDate: state.scheduledAt,
        // Target execution state -> PostStatus (`published` is `public`).
        status: state.status === 'published' ? PostStatus.PUBLIC : state.status,
      });
      await route.fulfill({
        body: JSON.stringify(buildJsonApiDocument('post', postId, payload)),
        contentType: 'application/json',
        status: 200,
      });
    });
  }

  // Mock tweet generation
  await routeApiPattern(page, '/posts/generate**', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    await route.fulfill({
      body: JSON.stringify([
        generateMockPost({
          id: 'generated-post-001',
          status: PostStatus.PROCESSING,
        }),
      ]),
      contentType: 'application/json',
      status: 201,
    });
  });
}

export async function mockReviewQueue(
  page: Page,
  options: {
    batchId?: string;
    itemAttributes?: Record<string, unknown>;
    itemId?: string;
    onItemAction?: (body: Record<string, unknown>) => void;
    postId?: string;
  } = {},
): Promise<void> {
  const batchId = options.batchId || 'batch-1';
  const itemId = options.itemId || 'item-1';
  const postId = options.postId || 'post-review-001';
  const now = new Date().toISOString();

  const batchListItem = {
    approvedCount: 0,
    failedCount: 0,
    id: batchId,
    pendingCount: 1,
    status: 'completed',
    totalCount: 1,
  };

  const batchDetail = {
    id: batchId,
    items: [
      {
        createdAt: now,
        format: 'video',
        id: itemId,
        label: 'Workflow Draft',
        platform: 'twitter',
        postId,
        prompt: 'Turn the winning clip into a reviewable draft.',
        status: 'completed',
        ...options.itemAttributes,
      },
    ],
    status: 'completed',
    totalCount: 1,
  };

  await routeApiPattern(page, '/batches**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('batches', [
            {
              attributes: batchListItem,
              id: batchId,
            },
          ]),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, `/batches/${batchId}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('batches', batchId, batchDetail),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(
    page,
    `/batches/${batchId}/items/action`,
    async (route) => {
      if (route.request().method() === 'POST') {
        options.onItemAction?.(
          route.request().postDataJSON() as Record<string, unknown>,
        );
        await route.fulfill({
          body: JSON.stringify(
            buildJsonApiDocument('batches', batchId, batchDetail),
          ),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.continue();
    },
  );
}

// ----------------------------------------------------------------------------
// Marketplace Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for marketplace listings (browse/category)
 */
export async function mockMarketplaceListings(
  page: Page,
  count = 6,
): Promise<void> {
  const listings = Array.from({ length: count }, (_, i) => ({
    attributes: {
      category: ['skill', 'workflow', 'preset', 'prompt'][i % 4],
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      description: `Mock listing ${i + 1} description with details`,
      id: `listing-${i + 1}`,
      imageUrl: `https://cdn.genfeed.ai/mock/listings/${i + 1}.jpg`,
      isFree: i % 3 === 0,
      price: i % 3 === 0 ? 0 : (i + 1) * 499,
      rating: 4 + (i % 2) * 0.5,
      reviewCount: (i + 1) * 3,
      sellerName: `Seller ${i + 1}`,
      sellerSlug: `seller-${i + 1}`,
      slug: `listing-${i + 1}`,
      title: `Mock Listing ${i + 1}`,
      type: ['skill', 'workflow', 'preset', 'prompt'][i % 4],
    },
    id: `listing-${i + 1}`,
    type: 'listings',
  }));

  await page.route(
    '**/api.genfeed.ai/v1/marketplace/listings**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: listings,
          meta: { page: 1, pageSize: count, totalCount: count },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

/**
 * Mock for a single listing detail
 */
export async function mockListingDetail(
  page: Page,
  options: {
    sellerSlug?: string;
    slug?: string;
    price?: number;
    isFree?: boolean;
    isOwned?: boolean;
  } = {},
): Promise<void> {
  const {
    sellerSlug = 'test-seller',
    slug = 'test-listing',
    price = 999,
    isFree = false,
    isOwned = false,
  } = options;

  await page.route(
    '**/api.genfeed.ai/v1/marketplace/listings/**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              category: 'workflow',
              description: 'A comprehensive workflow for content creation.',
              id: `${sellerSlug}-${slug}`,
              imageUrl: 'https://cdn.genfeed.ai/mock/listings/detail.jpg',
              instructions: 'Install and configure the workflow.',
              isFree,
              price,
              rating: 4.8,
              reviewCount: 42,
              sellerName: 'Test Seller',
              sellerSlug,
              slug,
              title: 'Test Listing Detail',
              type: 'workflow',
            },
            id: `${sellerSlug}-${slug}`,
            type: 'listings',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // Mock ownership check
  await page.route(
    '**/api.genfeed.ai/v1/marketplace/purchases/check**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              isOwned,
              purchaseId: isOwned ? 'purchase-mock-001' : null,
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

/**
 * Mock for Stripe checkout session creation
 */
export async function mockStripeCheckout(page: Page): Promise<void> {
  await page.route(
    '**/api.genfeed.ai/v1/marketplace/checkout',
    async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                sessionId: 'cs_test_mock_session_123',
                url: '/checkout/success?session_id=cs_test_mock_session_123',
              },
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.continue();
    },
  );

  // Mock the checkout session verification
  await page.route(
    '**/api.genfeed.ai/v1/marketplace/checkout/**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              paymentStatus: 'paid',
              purchaseId: 'purchase-mock-001',
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  // Block real Stripe
  await page.route('**/checkout.stripe.com/**', async (route) => {
    await route.fulfill({
      body: '<html><body>Mocked Stripe</body></html>',
      contentType: 'text/html',
      status: 200,
    });
  });
}

/**
 * Mock for library / user purchases
 */
export async function mockLibraryPurchases(
  page: Page,
  count = 4,
): Promise<void> {
  const items = Array.from({ length: count }, (_, i) => ({
    attributes: {
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      listingId: `listing-${i + 1}`,
      listingSlug: `listing-${i + 1}`,
      listingTitle: `Purchased Item ${i + 1}`,
      listingType: i % 2 === 0 ? 'workflow' : 'prompt',
      sellerSlug: `seller-${i + 1}`,
      status: 'completed',
    },
    id: `purchase-${i + 1}`,
    type: 'purchases',
  }));

  await page.route(
    '**/api.genfeed.ai/v1/marketplace/purchases**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: items,
          meta: { page: 1, pageSize: count, totalCount: count },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

/**
 * Mock for empty library
 */
export async function mockEmptyLibrary(page: Page): Promise<void> {
  await page.route(
    '**/api.genfeed.ai/v1/marketplace/purchases**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 10, totalCount: 0 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

/**
 * Mock for marketplace leaderboard
 */
export async function mockLeaderboard(page: Page): Promise<void> {
  const sellers = Array.from({ length: 10 }, (_, i) => ({
    attributes: {
      avatarUrl: `https://cdn.genfeed.ai/mock/avatars/${i + 1}.jpg`,
      name: `Top Seller ${i + 1}`,
      rank: i + 1,
      sales: 1000 - i * 80,
      slug: `top-seller-${i + 1}`,
    },
    id: `seller-${i + 1}`,
    type: 'sellers',
  }));

  await page.route(
    '**/api.genfeed.ai/v1/marketplace/leaderboard**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: sellers,
          meta: { totalCount: 10 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

// ----------------------------------------------------------------------------
// Admin Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for admin overview / stats
 */
export async function mockAdminStats(page: Page): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/admin/stats**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            activeSubscriptions: 284,
            generationsToday: 1543,
            mrr: 42500,
            newUsersToday: 37,
            totalOrganizations: 156,
            totalTemplates: 89,
            totalUsers: 2847,
          },
          id: 'admin-stats',
          type: 'stats',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Mock activity chart data
  await page.route('**/api.genfeed.ai/v1/admin/activity**', async (route) => {
    const days = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
      generations: Math.floor(Math.random() * 500) + 100,
      signups: Math.floor(Math.random() * 20) + 5,
    }));

    await route.fulfill({
      body: JSON.stringify({ data: days }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for admin users list
 */
export async function mockAdminUsers(page: Page, count = 10): Promise<void> {
  const users = Array.from({ length: count }, (_, i) => ({
    attributes: {
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      email: `user${i + 1}@example.com`,
      firstName: `User`,
      id: `user-${i + 1}`,
      imageUrl: `https://cdn.genfeed.ai/mock/avatars/user-${i + 1}.jpg`,
      lastName: `${i + 1}`,
      organizationName: `Org ${i + 1}`,
      role: i === 0 ? 'admin' : 'member',
      status: 'active',
    },
    id: `user-${i + 1}`,
    type: 'users',
  }));

  await page.route('**/api.genfeed.ai/v1/admin/users**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: users,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Also mock the generic users endpoint
  await page.route('**/api.genfeed.ai/v1/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: users,
          meta: { page: 1, pageSize: count, totalCount: count },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  });
}

/**
 * Mock for admin templates
 */
export async function mockAdminTemplates(page: Page, count = 8): Promise<void> {
  const templates = Array.from({ length: count }, (_, i) => ({
    attributes: {
      category: ['video', 'image', 'music'][i % 3],
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      description: `Template ${i + 1} description`,
      id: `template-${i + 1}`,
      name: `Template ${i + 1}`,
      status: 'active',
      thumbnailUrl: `https://cdn.genfeed.ai/mock/templates/${i + 1}.jpg`,
      usageCount: (i + 1) * 15,
    },
    id: `template-${i + 1}`,
    type: 'templates',
  }));

  const fulfillTemplates = async (route: Route): Promise<void> => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: templates,
          meta: { page: 1, pageSize: count, totalCount: count },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.continue();
  };

  await page.route('**/api.genfeed.ai/v1/templates**', fulfillTemplates);
  await page.route('**/v1/templates**', fulfillTemplates);
}

/**
 * Mock for CRM leads
 */
export async function mockCrmLeads(page: Page, count = 8): Promise<void> {
  const leads = Array.from({ length: count }, (_, i) => ({
    attributes: {
      company: `Company ${i + 1}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      email: `lead${i + 1}@example.com`,
      id: `lead-${i + 1}`,
      name: `Lead ${i + 1}`,
      source: ['website', 'referral', 'ads', 'organic'][i % 4],
      status: ['new', 'contacted', 'qualified', 'converted'][i % 4],
    },
    id: `lead-${i + 1}`,
    type: 'leads',
  }));

  const fulfillLeads = async (route: Route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: leads,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/crm/leads**', fulfillLeads);
  await page.route('**/api.genfeed.ai/crm/leads**', fulfillLeads);
  await page.route('**/api.genfeed.ai/admin/crm/leads**', fulfillLeads);
  await page.route(`${LOCAL_API}/crm/leads**`, fulfillLeads);
  await page.route(`${LOCAL_API}/admin/crm/leads**`, fulfillLeads);
}

/**
 * Mock for CRM companies
 */
export async function mockCrmCompanies(page: Page, count = 5): Promise<void> {
  const companies = Array.from({ length: count }, (_, i) => ({
    attributes: {
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      domain: `company${i + 1}.com`,
      id: `company-${i + 1}`,
      industry: ['tech', 'finance', 'media', 'retail'][i % 4],
      leadCount: (i + 1) * 3,
      name: `Company ${i + 1}`,
    },
    id: `company-${i + 1}`,
    type: 'companies',
  }));

  const fulfillCompanies = async (route: Route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: companies,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/crm/companies**', fulfillCompanies);
  await page.route('**/api.genfeed.ai/crm/companies**', fulfillCompanies);
  await page.route('**/api.genfeed.ai/admin/crm/companies**', fulfillCompanies);
  await page.route(`${LOCAL_API}/crm/companies**`, fulfillCompanies);
  await page.route(`${LOCAL_API}/admin/crm/companies**`, fulfillCompanies);
}

/**
 * Mock for CRM company detail
 */
export async function mockCrmCompanyDetail(
  page: Page,
  id = 'company-1',
): Promise<void> {
  const fulfillCompany = async (route: Route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            billingType: 'Monthly',
            domain: 'company1.com',
            id,
            name: 'Company 1',
            notes: 'Key account',
            status: 'Customer',
            twitterHandle: 'company1',
          },
          id,
          type: 'companies',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route(
    `**/api.genfeed.ai/admin/crm/companies/${id}`,
    fulfillCompany,
  );
  await page.route(`**/api.genfeed.ai/crm/companies/${id}`, fulfillCompany);
  await page.route(`${LOCAL_API}/admin/crm/companies/${id}`, fulfillCompany);
  await page.route(`${LOCAL_API}/crm/companies/${id}`, fulfillCompany);
}

/**
 * Mock for CRM tasks
 */
export async function mockCrmTasks(page: Page, count = 6): Promise<void> {
  const tasks = Array.from({ length: count }, (_, i) => ({
    attributes: {
      assignee: `User ${(i % 3) + 1}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
      id: `task-${i + 1}`,
      priority: ['low', 'medium', 'high'][i % 3],
      status: ['todo', 'in_progress', 'done'][i % 3],
      title: `Task ${i + 1}: Follow up`,
    },
    id: `task-${i + 1}`,
    type: 'tasks',
  }));

  const fulfillTasks = async (route: Route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: tasks,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/v1/crm/tasks**', fulfillTasks);
  await page.route('**/api.genfeed.ai/crm/tasks**', fulfillTasks);
  await page.route('**/api.genfeed.ai/admin/crm/tasks**', fulfillTasks);
  await page.route(`${LOCAL_API}/crm/tasks**`, fulfillTasks);
  await page.route(`${LOCAL_API}/admin/crm/tasks**`, fulfillTasks);
}

/**
 * Mock for CRM analytics
 */
export async function mockCrmAnalytics(page: Page): Promise<void> {
  const body = JSON.stringify({
    data: {
      attributes: {
        avgTimePerStage: [
          { avgDays: 2, stage: 'new' },
          { avgDays: 4, stage: 'qualified' },
          { avgDays: 7, stage: 'proposal' },
        ],
        funnel: [
          { count: 42, percentage: 100, stage: 'new' },
          { count: 28, percentage: 67, stage: 'qualified' },
          { count: 14, percentage: 33, stage: 'proposal' },
          { count: 6, percentage: 14, stage: 'won' },
        ],
        id: 'crm-analytics-1',
        sources: [
          { count: 18, source: 'organic' },
          { count: 14, source: 'referral' },
          { count: 10, source: 'paid' },
        ],
        velocity: Array.from({ length: 7 }, (_, index) => ({
          count: 3 + index,
          date: new Date(Date.now() - (6 - index) * 86400000).toISOString(),
        })),
      },
      id: 'crm-analytics-1',
      type: 'crm-analytics',
    },
  });

  const fulfillAnalytics = async (route: Route) => {
    await route.fulfill({
      body,
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/crm/analytics**', fulfillAnalytics);
  await page.route('**/api.genfeed.ai/admin/crm/analytics**', fulfillAnalytics);
  await page.route(`${LOCAL_API}/crm/analytics**`, fulfillAnalytics);
  await page.route(`${LOCAL_API}/admin/crm/analytics**`, fulfillAnalytics);
}

/**
 * Mock for admin analytics
 */
export async function mockAdminAnalytics(page: Page): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/admin/analytics**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            dailyActiveUsers: 523,
            monthlyActiveUsers: 2100,
            revenue: 42500,
            totalGenerations: 158420,
          },
          id: 'admin-analytics',
          type: 'analytics',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for the business analytics dashboard endpoint (superadmin).
 * Returns realistic-shaped data for all KPI sections: revenue, credits,
 * ingredients, leaders, projections, and comparisons.
 */
export async function mockBusinessAnalytics(page: Page): Promise<void> {
  const today = new Date();
  const dailySeries = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 29 + i);
    return d.toISOString().slice(0, 10);
  });

  await routeApiPattern(page, '/analytics/business', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: {
            comparisons: {
              cashInVsUsageValue: { cashIn: 34567, usageValue: 28000 },
              outstandingPrepaid: 8000,
              soldVsConsumed: { consumed: 42000, sold: 50000 },
            },
            credits: {
              consumed: 42000,
              dailyConsumedSeries: dailySeries.map((date) => ({
                amount: Math.floor(Math.random() * 1500 + 500),
                date,
              })),
              dailySoldSeries: dailySeries.map((date) => ({
                amount: Math.floor(Math.random() * 2000 + 800),
                date,
              })),
              sold: 50000,
              wowGrowth: 8.1,
            },
            ingredients: {
              categoryBreakdown: [
                { category: 'IMAGE', count: 22000 },
                { category: 'VIDEO', count: 9500 },
                { category: 'AUDIO', count: 6000 },
              ],
              dailySeries: dailySeries.map((date) => ({
                count: Math.floor(Math.random() * 1500 + 500),
                date,
              })),
              last7d: 8750,
              last30d: 37500,
              today: 1250,
              wowGrowth: 12.5,
            },
            leaders: {
              byCredits: [
                {
                  amount: 12000,
                  organizationId: 'org-1',
                  organizationName: 'Acme Corp',
                },
                {
                  amount: 9500,
                  organizationId: 'org-2',
                  organizationName: 'Globex Inc',
                },
              ],
              byIngredients: [
                {
                  count: 5000,
                  organizationId: 'org-1',
                  organizationName: 'Acme Corp',
                },
                {
                  count: 3800,
                  organizationId: 'org-3',
                  organizationName: 'Initech LLC',
                },
              ],
              byRevenue: [
                {
                  amount: 2500,
                  organizationId: 'org-1',
                  organizationName: 'Acme Corp',
                },
                {
                  amount: 1800,
                  organizationId: 'org-2',
                  organizationName: 'Globex Inc',
                },
              ],
            },
            projections: {
              creditsNext30d: 55000,
              ingredientsNext30d: 42000,
              insufficientData: false,
              isEstimate: true,
              revenueNext30d: 45000,
            },
            revenue: {
              dailySeries: dailySeries.map((date) => ({
                amount: Math.floor(Math.random() * 1500 + 200),
                date,
              })),
              last7d: 8765,
              last30d: 34567,
              mtd: 12345,
              today: 1234,
              wowGrowth: 5.2,
            },
          },
          id: 'business-analytics',
          type: 'business-analytics',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for rate limiting
 */
export async function mockRateLimiting(
  page: Page,
  urlPattern: string,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        errors: [
          {
            detail:
              'Rate limit exceeded. Please wait before making more requests.',
            status: '429',
            title: 'Too Many Requests',
          },
        ],
      }),
      contentType: 'application/json',
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': (Date.now() + 60000).toString(),
      },
      status: 429,
    });
  });
}

// ----------------------------------------------------------------------------
// Discovery Desk Mocks
// ----------------------------------------------------------------------------

/**
 * Mock for the Discovery Desk's followed-creator feed (`/social-sources/feed`).
 * The Desk's default `/trends/content` mock (api-interceptor's
 * `handleTrendsRoute`) already supplies one item whose Desk `source` is
 * `'trends'` ("Workflow demo clip"); this adds one item whose Desk `source`
 * is `'following'` (see `packages/pages/trends/desk/desk-items.ts`'s
 * `toDeskItemFromSourcePost`), so discovery specs can prove the Desk's
 * source-tab filter actually changes which rows render instead of only
 * checking the URL.
 */
export async function mockDiscoveryDeskFollowingFeed(
  page: Page,
): Promise<void> {
  const now = new Date().toISOString();
  const source: ISocialSource = {
    brandId: 'brand-1',
    createdAt: now,
    followersCount: 42_000,
    handle: 'creator.spotlight',
    id: 'social-source-desk-1',
    isActive: true,
    isDeleted: false,
    organizationId: 'test-org',
    platform: 'instagram',
    sourceType: SocialSourceType.ACCOUNT,
    updatedAt: now,
    userId: 'user-1',
  };
  const post: ISourcePost = {
    authorHandle: 'creator.spotlight',
    brandId: 'brand-1',
    contentType: 'post',
    createdAt: now,
    externalId: 'ext-desk-1',
    id: 'source-post-desk-1',
    isDeleted: false,
    organizationId: 'test-org',
    platform: 'instagram',
    publishedAt: now,
    sourceId: source.id,
    text: 'Creator collab teaser',
    updatedAt: now,
  };
  const feed: SocialSourcesResponse = {
    posts: [post],
    sources: [source],
    summary: { activeSources: 1, totalPosts: 1, totalSources: 1 },
  };

  await routeApiPattern(page, '/social-sources/feed**', async (route) => {
    await route.fulfill({
      body: JSON.stringify(feed),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for the Ads Research list endpoint (`/ads/research`) that honors the
 * requested platform, mirroring the real `AdsResearchController` /
 * `useAdsResearchPageClient.ts`'s `filters.platform` (server-side) contract —
 * the inherited fallback (`buildUnhandledApiMockBody`'s `/ads/research`
 * branch) always returns empty arrays regardless of platform, which let a
 * platform-tab switch look like it worked (URL + tab state changed) without
 * proving the results actually changed. Search itself stays client-side
 * (`useAdsResearchPageClient.ts` filters `allAds` by title/headline/body/
 * accountName locally), so this only needs to seed distinguishable ads, not
 * parse the search query.
 *
 * Registered as a single regex route so it matches `/ads/research` (with or
 * without a query string) across every host variant without also matching
 * `/ads/research/watchlist-readiness`.
 */
/**
 * Mirrors `AdsResearchService.normalizeFilters` (apps/server/api/src/
 * endpoints/ads-research/ads-research.service.ts) — the real `listAds()`
 * always echoes the request back as `filters` with these exact server
 * defaults applied, never `{}`.
 */
function normalizeAdsFilters(
  searchParams: URLSearchParams,
): AdsResearchFilters {
  const raw: AdsResearchFilters = {
    adAccountId: searchParams.get('adAccountId') || undefined,
    brandId: searchParams.get('brandId') || undefined,
    brandName: searchParams.get('brandName') || undefined,
    channel: (searchParams.get('channel') as AdsChannel) || undefined,
    credentialId: searchParams.get('credentialId') || undefined,
    industry: searchParams.get('industry') || undefined,
    limit: searchParams.get('limit')
      ? Number(searchParams.get('limit'))
      : undefined,
    loginCustomerId: searchParams.get('loginCustomerId') || undefined,
    metric:
      (searchParams.get('metric') as AdsResearchFilters['metric']) || undefined,
    platform:
      (searchParams.get('platform') as AdsResearchFilters['platform']) ||
      undefined,
    source:
      (searchParams.get('source') as AdsResearchFilters['source']) || undefined,
    timeframe:
      (searchParams.get('timeframe') as AdsResearchFilters['timeframe']) ||
      undefined,
  };

  return {
    ...raw,
    channel: raw.channel || AdsChannel.ALL,
    limit: raw.limit ? Math.min(raw.limit, 24) : 12,
    metric: raw.metric || 'performanceScore',
    source: raw.source || 'all',
    timeframe: raw.timeframe || 'last_30_days',
  };
}

export async function mockAdsResearchResults(page: Page): Promise<void> {
  // `mapPublicItem`/`mapResearchItem` in the real service always emit
  // `channel: AdsChannel.ALL` — `AdsChannel` only varies on connected-account
  // ads pulled from a live ad account, never on the public archive rows this
  // mock stands in for.
  const items: AdsResearchItem[] = [
    {
      channel: AdsChannel.ALL,
      explanation: 'High CTR carousel promoting a seasonal discount.',
      id: 'ads-research-meta-1',
      metrics: { clicks: 420, ctr: 3.1, impressions: 13_500 },
      platform: AdsPlatform.META,
      source: 'public',
      sourceId: 'meta-src-1',
      title: 'Meta Winter Sale Carousel',
    },
    {
      channel: AdsChannel.ALL,
      explanation: 'Top-performing search ad bundling three SKUs.',
      id: 'ads-research-google-1',
      metrics: { clicks: 310, ctr: 4.4, impressions: 7_050 },
      platform: AdsPlatform.GOOGLE,
      source: 'public',
      sourceId: 'google-src-1',
      title: 'Google Search Bundle Deal',
    },
  ];

  await page.route(/\/ads\/research\/?(?:\?.*)?$/, async (route) => {
    const searchParams = new URL(route.request().url()).searchParams;
    const requestedPlatform = searchParams.get('platform');
    const matching = requestedPlatform
      ? items.filter((item) => item.platform === requestedPlatform)
      : items;
    const filters = normalizeAdsFilters(searchParams);

    const response: AdsResearchResponse = {
      connectedAds: [],
      filters,
      publicAds: matching,
      summary: {
        connectedCount: 0,
        publicCount: matching.length,
        reviewPolicy: 'Review required.',
        selectedPlatform: filters.platform ?? 'all',
        selectedSource: filters.source ?? 'all',
      },
    };

    await route.fulfill({
      body: JSON.stringify(response),
      contentType: 'application/json',
      status: 200,
    });
  });
}
