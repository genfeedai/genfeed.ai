import type { Page, Route } from '@playwright/test';
import {
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

const LOCAL_API = 'http://local.genfeed.ai:3010/v1';

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

function buildAvatarIngredientDocument(avatar: MockAvatarIdentityFixture) {
  return {
    attributes: {
      category: 'avatar',
      createdAt: new Date().toISOString(),
      id: avatar.id,
      metadata: {
        description: `${avatar.label} fixture`,
        extension: avatar.extension,
        label: avatar.label,
      },
      parent: avatar.parent ?? null,
      status: 'generated',
      updatedAt: new Date().toISOString(),
    },
    id: avatar.id,
    type: 'ingredients',
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
      status: 'generated',
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
    durationMs,
    error:
      execution.status === 'failed'
        ? String(execution.results.error || 'Execution failed')
        : undefined,
    id: execution.id,
    metadata: {
      creditsUsed: execution.status === 'completed' ? 18 : 7,
      logs: execution.logs,
    },
    nodeResults: execution.logs.map((_log, index) => ({
      completedAt:
        index < execution.logs.length - 1 || execution.status !== 'running'
          ? execution.completedAt || new Date().toISOString()
          : undefined,
      error:
        execution.status === 'failed' && index === execution.logs.length - 1
          ? String(execution.results.error || execution.logs[index])
          : undefined,
      nodeId: `node-${index + 1}`,
      nodeType: index === execution.logs.length - 1 ? 'publish' : 'generate',
      output: index === execution.logs.length - 1 ? execution.results : {},
      progress:
        execution.status === 'running' && index === execution.logs.length - 1
          ? 42
          : 100,
      startedAt: execution.startedAt,
      status:
        execution.status === 'failed' && index === execution.logs.length - 1
          ? 'failed'
          : execution.status === 'running' &&
              index === execution.logs.length - 1
            ? 'running'
            : 'completed',
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
              thumbnailUrl: 'https://cdn.genfeed.ai/mock/video/thumb.jpg',
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

  await page.route('**/api.genfeed.ai/v1/images', async (route) => {
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
              thumbnailUrl: 'https://cdn.genfeed.ai/mock/image/thumb.jpg',
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

    await route.continue();
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
  const { plan = 'pro', credits = 1000, hasPaymentMethod = true } = options;

  await routeApiPattern(page, '/subscriptions/**', async (route) => {
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

  await routeApiPattern(page, '/credits/**', async (route) => {
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
        activeRuns: [],
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
        runs: [],
        stats: {
          activeRuns: 0,
          completedToday: 2,
          failedToday: 0,
          totalCreditsToday: 25,
          totalRuns: 7,
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

  await routeApiPattern(page, '/activities**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attributes: {
              metadata: { title: 'Product Demo', videoId: 'mock-video-1' },
              timestamp: periodEnd,
              type: 'video_generated',
            },
            id: 'activity-1',
            type: 'activities',
          },
          {
            attributes: {
              metadata: { imageId: 'mock-image-1', title: 'Banner Design' },
              timestamp: '2025-03-01T11:00:00.000Z',
              type: 'image_generated',
            },
            id: 'activity-2',
            type: 'activities',
          },
          {
            attributes: {
              metadata: { from: 'starter', to: 'pro' },
              timestamp: '2025-02-28T12:00:00.000Z',
              type: 'subscription_upgraded',
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
  linkedRunIds: string[];
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
    linkedRunIds: [],
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

  await routeApiPattern(page, '/workspace-tasks**', async (route) => {
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

    const planThreadMatch = pathname.match(
      /\/workspace-tasks\/([^/]+)\/plan-thread$/,
    );
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
      /\/workspace-tasks\/([^/]+)\/follow-up-tasks$/,
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

    if (method === 'POST' && pathname.endsWith('/workspace-tasks')) {
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

    const approveMatch = pathname.match(/\/workspace-tasks\/([^/]+)\/approve$/);
    if (method === 'PATCH' && approveMatch) {
      const [, taskId] = approveMatch;
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
      const task = tasks.find((item) => item.id === taskId)!;

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workspace-task', task.id, task),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const requestChangesMatch = pathname.match(
      /\/workspace-tasks\/([^/]+)\/request-changes$/,
    );
    if (method === 'PATCH' && requestChangesMatch) {
      const [, taskId] = requestChangesMatch;
      const payload = extractRequestPayload(route);
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
      const task = tasks.find((item) => item.id === taskId)!;

      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('workspace-task', task.id, task),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    const dismissMatch = pathname.match(/\/workspace-tasks\/([^/]+)\/dismiss$/);
    if (method === 'PATCH' && dismissMatch) {
      const [, taskId] = dismissMatch;
      const payload = extractRequestPayload(route);
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
      const task = tasks.find((item) => item.id === taskId)!;

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
            planModeEnabled: true,
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
                planModeEnabled: true,
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
    if (method === 'GET') {
      const resources = executions.map((execution) => ({
        attributes: normalizeExecution(
          execution,
          workflowLabels.get(execution.workflowId),
        ),
        id: execution.id,
      }));
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('workflow-executions', resources),
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
        body: JSON.stringify(
          buildJsonApiDocument('workflow-executions', 'exec-new', execution),
        ),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }
    await route.continue();
  });

  await routeApiPattern(page, '/workflow-executions/*', async (route) => {
    const url = route.request().url();
    const idMatch = url.match(/\/workflow-executions\/([^/?]+)/);
    const id = idMatch ? idMatch[1] : 'exec-001';
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
      body: JSON.stringify(
        buildJsonApiDocument('workflow-executions', execution.id, normalized),
      ),
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
  await routeApiPattern(page, '/workflows/templates**', async (route) => {
    const resources = templates.map((template) => ({
      attributes: {
        category: template.category,
        description: template.description,
        icon: 'Sparkles',
        id: template.id,
        name: template.name,
        steps: buildTemplateSteps(template.nodeCount, template.id),
        thumbnailUrl: template.thumbnailUrl,
      },
      id: template.id,
    }));
    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection('workflow-templates', resources),
      ),
      contentType: 'application/json',
      status: 200,
    });
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
  const runFixtures = [
    {
      completedAt: '2026-03-26T10:15:00.000Z',
      createdAt: '2026-03-26T10:00:00.000Z',
      creditsUsed: 6,
      durationMs: 18000,
      id: 'run-1',
      label: 'Trend scan',
      metadata: {
        actualModel: 'google/gemini-2.5-flash',
        requestedModel: 'openrouter/auto',
        routingPolicy: 'fresh-live-data',
        webSearchEnabled: true,
      },
      objective: 'Find latest creator trends',
      organization: 'mock-org-id-e2e-test',
      progress: 100,
      retryCount: 0,
      startedAt: '2026-03-26T10:01:00.000Z',
      status: 'completed',
      toolCalls: [],
      trigger: 'manual',
      updatedAt: '2026-03-26T10:15:00.000Z',
      user: 'mock-user-id-e2e-test',
    },
    {
      completedAt: '2026-03-26T08:15:00.000Z',
      createdAt: '2026-03-26T08:00:00.000Z',
      creditsUsed: 3,
      durationMs: 9000,
      id: 'run-2',
      label: 'Caption draft',
      metadata: {
        actualModel: 'anthropic/claude-sonnet-4-5',
        requestedModel: 'anthropic/claude-sonnet-4-5',
      },
      objective: 'Write captions',
      organization: 'mock-org-id-e2e-test',
      progress: 100,
      retryCount: 0,
      startedAt: '2026-03-26T08:01:00.000Z',
      status: 'completed',
      toolCalls: [],
      trigger: 'manual',
      updatedAt: '2026-03-26T08:15:00.000Z',
      user: 'mock-user-id-e2e-test',
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

  await routeApiPattern(page, '/auth/bootstrap/overview**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRuns: [],
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
        runs: runFixtures,
        stats: {
          activeRuns: 0,
          completedToday: 2,
          failedToday: 0,
          totalCreditsToday: 9,
          totalRuns: runFixtures.length,
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

  await routeApiPattern(page, '/runs/stats**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeRuns: 0,
        anomalies: [
          {
            baselineValue: 0.2,
            currentValue: 0.55,
            description:
              'Auto-routing jumped materially above the recent baseline.',
            kind: 'auto_routing_spike',
            severity: 'warning',
            title: 'Auto-routing spike',
          },
        ],
        autoRoutedRuns: 1,
        completedToday: 2,
        failedToday: 0,
        routingPaths: [
          {
            actualModel: 'google/gemini-2.5-flash',
            count: 1,
            requestedModel: 'openrouter/auto',
          },
        ],
        timeRange:
          new URL(route.request().url()).searchParams.get('timeRange') ?? '7d',
        topActualModels: [{ count: 1, model: 'google/gemini-2.5-flash' }],
        topRequestedModels: [{ count: 1, model: 'openrouter/auto' }],
        totalCreditsToday: 9,
        totalRuns: 2,
        trends: [
          {
            autoRoutedRate: 0.5,
            autoRoutedRuns: 1,
            averageCreditsUsed: 4.5,
            bucket: '2026-03-25',
            totalCreditsUsed: 9,
            totalRuns: 2,
            webEnabledRate: 0.5,
            webEnabledRuns: 1,
          },
        ],
        webEnabledRuns: 1,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/runs/active**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { page: 1, pageSize: 0, totalCount: 0 },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeApiPattern(page, '/runs**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const url = new URL(route.request().url());
    if (
      url.pathname.endsWith('/runs/stats') ||
      url.pathname.endsWith('/runs/active')
    ) {
      await route.continue();
      return;
    }
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const model = url.searchParams.get('model');

    const filteredRuns = runFixtures.filter((run) => {
      if (
        query &&
        ![
          run.label,
          run.objective ?? '',
          String(run.metadata.actualModel ?? ''),
          String(run.metadata.requestedModel ?? ''),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (!model) {
        return true;
      }

      return (
        run.metadata.actualModel === model ||
        run.metadata.requestedModel === model
      );
    });

    await route.fulfill({
      body: JSON.stringify(
        buildJsonApiCollection(
          'agent-runs',
          filteredRuns.map((run) => ({
            attributes: run,
            id: run.id,
          })),
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
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('agent-campaigns', [
            {
              attributes: {
                agents: ['agent-1', 'agent-2'],
                brief: 'Coordinate a multi-agent launch sequence.',
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
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('agent-campaigns', 'agent-campaign-created', {
            agents: Array.isArray(requestBody.agents) ? requestBody.agents : [],
            brief:
              typeof requestBody.brief === 'string'
                ? requestBody.brief
                : undefined,
            campaignLeadStrategyId:
              typeof requestBody.campaignLeadStrategyId === 'string'
                ? requestBody.campaignLeadStrategyId
                : undefined,
            creditsAllocated:
              typeof requestBody.creditsAllocated === 'number'
                ? requestBody.creditsAllocated
                : 0,
            creditsUsed: 0,
            label:
              typeof requestBody.label === 'string'
                ? requestBody.label
                : 'Created Campaign',
            organization: 'mock-org-id-e2e-test',
            startDate:
              typeof requestBody.startDate === 'string'
                ? requestBody.startDate
                : nowIso,
            status:
              typeof requestBody.status === 'string'
                ? requestBody.status
                : 'draft',
            updatedAt: nowIso,
            user: 'mock-user-id-e2e-test',
          }),
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

  await routeApiPattern(page, '/runs**', async (route) => {
    if (route.request().method() === 'GET') {
      const resources = [
        {
          attributes: {
            completedAt: nowIso,
            createdAt: twoDaysAgoIso,
            creditsUsed: 24,
            durationMs: 240000,
            error: undefined,
            id: 'run-1',
            label: 'Launch Sprint',
            metadata: {},
            objective: 'Draft launch content',
            organization: 'mock-org-id-e2e-test',
            parentRun: undefined,
            progress: 100,
            retryCount: 0,
            startedAt: twoDaysAgoIso,
            status: 'completed',
            strategy: 'strategy-1',
            summary: 'Generated launch assets',
            toolCalls: [
              {
                creditsUsed: 8,
                durationMs: 12000,
                executedAt: twoDaysAgoIso,
                status: 'completed',
                toolName: 'research',
              },
              {
                creditsUsed: 6,
                durationMs: 9000,
                executedAt: nowIso,
                status: 'completed',
                toolName: 'compose',
              },
            ],
            trigger: 'scheduled',
            updatedAt: nowIso,
            user: 'mock-user-id-e2e-test',
          },
          id: 'run-1',
        },
        {
          attributes: {
            completedAt: new Date(
              now.getTime() - 3 * 60 * 60 * 1000,
            ).toISOString(),
            createdAt: new Date(
              now.getTime() - 4 * 60 * 60 * 1000,
            ).toISOString(),
            creditsUsed: 18,
            durationMs: 420000,
            error: 'Timeout while fetching insights',
            id: 'run-2',
            label: 'Audience Pulse',
            metadata: {},
            objective: 'Summarize audience signals',
            organization: 'mock-org-id-e2e-test',
            parentRun: undefined,
            progress: 100,
            retryCount: 1,
            startedAt: new Date(
              now.getTime() - 4 * 60 * 60 * 1000,
            ).toISOString(),
            status: 'failed',
            strategy: 'strategy-1',
            summary: 'Hit an analytics timeout',
            toolCalls: [
              {
                creditsUsed: 5,
                durationMs: 8000,
                error: 'Timeout while fetching insights',
                executedAt: new Date(
                  now.getTime() - 4 * 60 * 60 * 1000,
                ).toISOString(),
                status: 'failed',
                toolName: 'analytics',
              },
            ],
            trigger: 'manual',
            updatedAt: nowIso,
            user: 'mock-user-id-e2e-test',
          },
          id: 'run-2',
        },
      ];

      await route.fulfill({
        body: JSON.stringify(buildJsonApiCollection('agent-runs', resources)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  await routeApiPattern(page, '/runs/stats**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          activeRuns: 1,
          completedToday: 3,
          failedToday: 1,
          totalCreditsToday: 96,
          totalRuns: 42,
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  await routeApiPattern(page, '/runs/active**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection('agent-runs', [
            {
              attributes: {
                completedAt: null,
                createdAt: nowIso,
                creditsUsed: 12,
                durationMs: 182000,
                error: undefined,
                id: 'run-active-1',
                label: 'Launch Sprint',
                metadata: {},
                objective: 'Draft launch content',
                organization: 'mock-org-id-e2e-test',
                parentRun: undefined,
                progress: 48,
                retryCount: 0,
                startedAt: nowIso,
                status: 'running',
                strategy: 'strategy-1',
                summary: 'Generating launch assets',
                toolCalls: [
                  {
                    creditsUsed: 4,
                    durationMs: 6000,
                    executedAt: nowIso,
                    status: 'completed',
                    toolName: 'research',
                  },
                ],
                trigger: 'manual',
                updatedAt: nowIso,
                user: 'mock-user-id-e2e-test',
              },
              id: 'run-active-1',
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
            type: 'brands',
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

  await routeApiPattern(
    page,
    '/organizations/**/ingredients**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            buildAvatarIngredientDocument(avatars.source),
            buildAvatarIngredientDocument(avatars.fallback),
            buildAvatarIngredientDocument(avatars.video),
          ],
          meta: { page: 1, pageSize: 3, totalCount: 3 },
        }),
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
            type: 'brands',
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
          type: 'brands',
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

  await routeApiPattern(
    page,
    '/organizations/**/ingredients**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            buildAvatarIngredientDocument(avatars.source),
            buildAvatarIngredientDocument(avatars.video),
          ],
          meta: { page: 1, pageSize: 2, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  const avatarPatchHandler = async (route: Route) => {
    const isVideo = route.request().url().includes(avatars.video.id);
    const current = isVideo ? avatars.video : avatars.source;
    const nextCategory = String(
      extractRequestPayload(route).category ?? 'avatar',
    );

    await route.fulfill({
      body: JSON.stringify({
        data: buildAvatarIngredientDocument({
          ...current,
          extension: nextCategory === 'image' ? 'jpg' : current.extension,
        }),
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
  await page.route('**/api.genfeed.ai/v1/captions**', async (route) => {
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
  });

  await page.route('**/api.genfeed.ai/v1/ingredients**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: new Date().toISOString(),
                name: 'Product Photo',
                type: 'image',
                url: 'https://cdn.genfeed.ai/mock/ingredient.jpg',
              },
              id: 'ingredient-1',
              type: 'ingredients',
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
export async function mockNetworkError(
  page: Page,
  urlPattern: string,
): Promise<void> {
  await page.route(urlPattern, async (route) => {
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
    status: 'DRAFT',
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
      status: 'DRAFT',
    }),
    generateMockPost({
      description: 'Second draft post content',
      id: 'post-draft-002',
      label: 'Draft Post 2',
      status: 'DRAFT',
    }),
    generateMockPost({
      description: 'Scheduled for next week',
      id: 'post-sched-001',
      label: 'Scheduled Post 1',
      scheduledDate: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: 'SCHEDULED',
    }),
    generateMockPost({
      description: 'Already published post',
      id: 'post-pub-001',
      label: 'Published Post 1',
      platformUrl: 'https://twitter.com/mock/status/123',
      status: 'PUBLIC',
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
          'posts',
          filtered.map((post) => ({
            attributes: {
              ...post,
              _id: String(post.id),
            },
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
      status: 'DRAFT',
    });

  await routeApiPattern(page, '/posts/*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const payload = {
        ...mockPost,
        _id: String(mockPost.id),
      };
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('posts', String(mockPost.id), payload),
        ),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (method === 'PATCH' || method === 'PUT') {
      const payload = {
        ...mockPost,
        _id: String(mockPost.id),
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiDocument('posts', String(mockPost.id), payload),
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
 * Mock for calendar posts endpoint
 */
export async function mockCalendarPosts(
  page: Page,
  posts?: Record<string, unknown>[],
): Promise<void> {
  const now = new Date();
  const mockPosts = posts || [
    generateMockPost({
      description: 'Monday morning post',
      id: 'cal-post-001',
      label: 'Calendar Post 1',
      platform: 'twitter',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        15,
        9,
        0,
      ).toISOString(),
      status: 'SCHEDULED',
    }),
    generateMockPost({
      description: 'Midweek content',
      id: 'cal-post-002',
      label: 'Calendar Post 2',
      platform: 'instagram',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        18,
        14,
        0,
      ).toISOString(),
      status: 'SCHEDULED',
    }),
    generateMockPost({
      description: 'Published last week',
      id: 'cal-post-003',
      label: 'Calendar Post 3',
      platform: 'youtube',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        10,
        12,
        0,
      ).toISOString(),
      status: 'PUBLIC',
    }),
    generateMockPost({
      description: 'Draft with no schedule',
      id: 'cal-post-004',
      label: 'Calendar Post 4',
      platform: 'linkedin',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        22,
        10,
        0,
      ).toISOString(),
      status: 'DRAFT',
    }),
  ];

  await routeApiPattern(page, '/posts**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        body: JSON.stringify(
          buildJsonApiCollection(
            'posts',
            mockPosts.map((post) => ({
              attributes: {
                ...post,
                _id: String(post.id),
              },
              id: String(post.id),
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
 * Mock for post publishing / scheduling
 */
export async function mockPostPublishing(
  page: Page,
  options: MockOptions = {},
): Promise<void> {
  const { delay = 0 } = options;

  // Mock status update endpoint
  await page.route('**/api.genfeed.ai/v1/posts/*/status', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    await route.fulfill({
      body: JSON.stringify({
        ...generateMockPost({
          status: 'SCHEDULED',
        }),
        updatedAt: new Date().toISOString(),
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Mock schedule update
  await page.route('**/api.genfeed.ai/v1/posts/*/schedule', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    await route.fulfill({
      body: JSON.stringify({
        ...generateMockPost({
          scheduledDate: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
          status: 'SCHEDULED',
        }),
        updatedAt: new Date().toISOString(),
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Mock tweet generation
  await page.route('**/api.genfeed.ai/v1/posts/generate**', async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    await route.fulfill({
      body: JSON.stringify([
        generateMockPost({
          id: 'generated-post-001',
          status: 'PROCESSING',
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
    itemId?: string;
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

  await page.route('**/api.genfeed.ai/v1/templates**', async (route) => {
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
  });
}

/**
 * Mock for darkroom gallery
 */
export async function mockDarkroomGallery(
  page: Page,
  count = 12,
): Promise<void> {
  const images = Array.from({ length: count }, (_, i) => ({
    attributes: {
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      height: 1024,
      id: `darkroom-img-${i + 1}`,
      prompt: `Darkroom generated image ${i + 1}`,
      status: 'completed',
      thumbnailUrl: `https://cdn.genfeed.ai/mock/darkroom/thumb-${i + 1}.jpg`,
      url: `https://cdn.genfeed.ai/mock/darkroom/${i + 1}.png`,
      width: 1024,
    },
    id: `darkroom-img-${i + 1}`,
    type: 'images',
  }));

  await page.route('**/api.genfeed.ai/v1/darkroom/gallery**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: images,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  // Also mock generic darkroom images
  await page.route('**/api.genfeed.ai/v1/darkroom/images**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: images,
        meta: { page: 1, pageSize: count, totalCount: count },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

/**
 * Mock for darkroom characters
 */
export async function mockDarkroomCharacters(
  page: Page,
  count = 5,
): Promise<void> {
  const characters = Array.from({ length: count }, (_, i) => ({
    attributes: {
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      description: `Character ${i + 1} description`,
      id: `char-${i + 1}`,
      imageUrl: `https://cdn.genfeed.ai/mock/characters/${i + 1}.jpg`,
      name: `Character ${i + 1}`,
      slug: `character-${i + 1}`,
      status: 'active',
    },
    id: `char-${i + 1}`,
    type: 'characters',
  }));

  await page.route(
    '**/api.genfeed.ai/v1/darkroom/characters**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: characters,
          meta: {
            page: 1,
            pageSize: count,
            totalCount: count,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  await page.route('**/api.genfeed.ai/v1/characters**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          data: characters,
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
 * Mock for darkroom infrastructure
 */
export async function mockDarkroomInfrastructure(page: Page): Promise<void> {
  await page.route(
    '**/api.genfeed.ai/admin/darkroom/infrastructure/ec2/status**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                id: 'i-training-1',
                instanceId: 'i-training-1',
                instanceType: 'g5.xlarge',
                name: 'Training Node',
                privateIpAddress: '10.0.0.12',
                publicIpAddress: '34.0.0.12',
                role: 'training',
                state: 'running',
              },
              id: 'i-training-1',
              type: 'ec2-instances',
            },
            {
              attributes: {
                id: 'i-images-1',
                instanceId: 'i-images-1',
                instanceType: 'g6.xlarge',
                name: 'Images Node',
                privateIpAddress: '10.0.0.18',
                publicIpAddress: '34.0.0.18',
                role: 'images',
                state: 'stopped',
              },
              id: 'i-images-1',
              type: 'ec2-instances',
            },
          ],
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  await page.route(
    '**/api.genfeed.ai/admin/darkroom/infrastructure/fleet/health**',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              cloudfront: {
                distributionId: 'dist-1',
                domainName: 'cdn.genfeed.ai',
                status: 'Deployed',
              },
              fleet: [
                {
                  endpoint: 'https://images.genfeed.ai',
                  lastCheckedAt: new Date().toISOString(),
                  responseTimeMs: 184,
                  role: 'images',
                  status: 'online',
                  uptimeSeconds: 7200,
                },
                {
                  endpoint: 'https://training.genfeed.ai',
                  lastCheckedAt: new Date().toISOString(),
                  responseTimeMs: 412,
                  role: 'training',
                  status: 'online',
                  uptimeSeconds: 14400,
                },
              ],
              id: 'fleet-health-1',
            },
            id: 'fleet-health-1',
            type: 'fleet-health',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  await page.route(
    '**/api.genfeed.ai/admin/darkroom/infrastructure/ec2/action-all',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              results: [
                { instanceId: 'i-training-1', success: true },
                { instanceId: 'i-images-1', success: true },
              ],
            },
            id: 'bulk-ec2-action',
            type: 'bulk-ec2-action',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );

  await page.route(
    '**/api.genfeed.ai/admin/darkroom/infrastructure/cloudfront/invalidate',
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: {
              invalidationId: 'invalidate-1',
              message: 'CloudFront invalidation started',
            },
            id: 'invalidate-1',
            type: 'cloudfront-invalidation',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
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
