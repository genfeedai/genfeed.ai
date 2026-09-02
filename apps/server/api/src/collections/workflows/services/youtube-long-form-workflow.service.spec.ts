import {
  PUBLIC_LONG_FORM_ORGANIZATION_ID,
  PUBLIC_LONG_FORM_USER_ID,
  YOUTUBE_LONG_FORM_ACTION_IDS,
  YOUTUBE_LONG_FORM_WORKFLOW_ID,
  YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID,
  YoutubeLongFormWorkflowService,
} from '@api/collections/workflows/services/youtube-long-form-workflow.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowActionRequest,
  SystemWorkflowGraphDefinition,
} from '@api/collections/workflows/system-workflow-runner.service';
import { testId } from '@helpers/testing/test-id.helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const INGREDIENT_ID = testId('ingredient');

const DOCUMENT = {
  content: 'Long-form body',
  outputType: 'newsletter' as const,
  summary: 'Summary',
  title: 'Long-form title',
  videoId: 'video_123',
  youtubeUrl: 'https://www.youtube.com/watch?v=video_123',
};

describe('YoutubeLongFormWorkflowService', () => {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const workflows = new Map<string, SystemWorkflowGraphDefinition>();
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn((definition: SystemWorkflowGraphDefinition) => {
      workflows.set(definition.canonicalId, definition);
    }),
    runWorkflow: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    article: { create: vi.fn() },
    brand: { findFirst: vi.fn() },
    ingredient: { create: vi.fn(), findFirst: vi.fn() },
    metadata: { create: vi.fn() },
    newsletter: { create: vi.fn() },
    prompt: { create: vi.fn() },
    workflowArtifact: { findFirst: vi.fn() },
    workflowExecution: { findFirst: vi.fn() },
  };

  let service: YoutubeLongFormWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    actions.clear();
    workflows.clear();
    prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    service = new YoutubeLongFormWorkflowService(
      { processVideo: vi.fn(), waitForJob: vi.fn() } as never,
      { get: vi.fn() } as never,
      { chatCompletion: vi.fn() } as never,
      prisma as never,
      runner as never,
      { transcribeUrl: vi.fn() } as never,
    );
    service.onModuleInit();
  });

  it('registers conversion and explicit source-promotion workflow graphs', () => {
    const conversion = workflows.get(YOUTUBE_LONG_FORM_WORKFLOW_ID);
    expect(conversion).toMatchObject({
      resultNodeId: 'persist-output',
      version: 2,
    });
    expect(conversion?.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'register-audio',
          target: 'transcribe-audio',
        }),
        expect.objectContaining({
          source: 'register-source',
          target: 'transcribe-audio',
        }),
      ]),
    );
    const promotion = workflows.get(YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID);
    expect(promotion).toMatchObject({
      resultNodeId: 'create-source-asset',
    });
    expect(
      promotion?.definition.nodes.find(
        (node) => node.id === 'create-source-asset',
      ),
    ).toMatchObject({
      data: {
        config: {
          actionId: YOUTUBE_LONG_FORM_ACTION_IDS.CREATE_SOURCE_LIBRARY_ASSET,
        },
      },
    });
    expect(
      promotion?.definition.nodes.find(
        (node) => node.id === 'plan-source-asset',
      ),
    ).toMatchObject({
      data: {
        config: {
          actionId: YOUTUBE_LONG_FORM_ACTION_IDS.PLAN_SOURCE_LIBRARY_ASSET,
        },
      },
    });
  });

  it('runs the public tool as an ephemeral preview under the public workflow principal', async () => {
    runner.runWorkflow.mockResolvedValue({
      provenance: { executionId: 'execution-public' },
      result: DOCUMENT,
    });

    const result = await service.runPublic(
      DOCUMENT.youtubeUrl,
      DOCUMENT.outputType,
    );

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
        inputValues: expect.objectContaining({
          persistence: 'preview',
          retentionPolicy: 'terminal',
        }),
        metadata: expect.objectContaining({
          executionRetention: {
            purgeAfterHours: 24,
            scrubNodePayloads: 'all',
          },
        }),
        organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
        userId: PUBLIC_LONG_FORM_USER_ID,
      }),
    );
    expect(result).toEqual({ ...DOCUMENT, executionId: 'execution-public' });
  });

  it('runs authenticated conversion with the real tenant ownership context', async () => {
    runner.runWorkflow.mockResolvedValue({
      provenance: { executionId: 'execution-account' },
      result: {
        ...DOCUMENT,
        contentId: 'newsletter-1',
        sourceArtifactId: 'artifact-source',
      },
    });

    const result = await service.runAuthenticated({
      brandId: 'brand-1',
      organizationId: 'org-1',
      outputType: DOCUMENT.outputType,
      userId: 'user-1',
      youtubeUrl: DOCUMENT.youtubeUrl,
    });

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
        inputValues: expect.objectContaining({
          brandId: 'brand-1',
          persistence: 'account',
          retentionPolicy: 'ttl',
        }),
        metadata: expect.objectContaining({
          executionRetention: {
            scrubNodePayloads: expect.arrayContaining([
              'extract-audio',
              'transcribe-audio',
              'transform-text',
            ]),
          },
        }),
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      contentId: 'newsletter-1',
      executionId: 'execution-account',
      sourceArtifactId: 'artifact-source',
    });
  });

  it('returns public preview output without creating an article or newsletter', async () => {
    const persist = actions.get(YOUTUBE_LONG_FORM_ACTION_IDS.PERSIST_OUTPUT);
    expect(persist).toBeDefined();

    const result = await persist?.(
      actionRequest({ document: DOCUMENT, persistence: 'preview' }),
    );

    expect(result).toEqual(DOCUMENT);
    expect(prisma.article.create).not.toHaveBeenCalled();
    expect(prisma.newsletter.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists the selected newsletter with real org, user, brand, and source reference', async () => {
    prisma.newsletter.create.mockResolvedValue({ id: 'newsletter-1' });
    const persist = actions.get(YOUTUBE_LONG_FORM_ACTION_IDS.PERSIST_OUTPUT);

    const result = await persist?.(
      actionRequest(
        {
          brandId: 'brand-1',
          document: DOCUMENT,
          persistence: 'account',
          sourceArtifact: { artifactId: 'artifact-source' },
        },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    );

    expect(prisma.newsletter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          sourceRefs: [
            {
              label: DOCUMENT.title,
              sourceType: 'youtube',
              url: DOCUMENT.youtubeUrl,
            },
          ],
          userId: 'user-1',
        }),
      }),
    );
    expect(result).toMatchObject({
      contentId: 'newsletter-1',
      sourceArtifactId: 'artifact-source',
    });
  });

  it('rejects durable persistence under the synthetic public principal', async () => {
    const persist = actions.get(YOUTUBE_LONG_FORM_ACTION_IDS.PERSIST_OUTPUT);

    await expect(
      persist?.(
        actionRequest(
          { document: DOCUMENT, persistence: 'account' },
          {
            organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
            userId: PUBLIC_LONG_FORM_USER_ID,
          },
        ),
      ),
    ).rejects.toThrow('Authenticated account ownership is required');
    expect(prisma.newsletter.create).not.toHaveBeenCalled();
  });

  it('invokes source promotion only through its explicit hidden workflow graph', async () => {
    runner.runWorkflow.mockResolvedValue({
      provenance: { executionId: 'promotion-execution' },
      result: {
        artifactId: 'artifact-source',
        ingredientId: INGREDIENT_ID,
        status: 'linked',
      },
    });

    await service.promoteSourceToLibrary({
      artifactId: 'artifact-source',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID,
        inputValues: { artifactId: 'artifact-source' },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('creates a deterministic tenant Library asset from trusted artifact metadata', async () => {
    prisma.workflowArtifact.findFirst.mockResolvedValue({
      execution: { userId: 'user-1' },
      executionId: 'source-execution',
      metadata: {
        resolvedUrl: 'https://cdn.example.com/source.mp4',
        sourceTitle: DOCUMENT.title,
        videoId: DOCUMENT.videoId,
        youtubeUrl: DOCUMENT.youtubeUrl,
      },
      promotionTargetId: INGREDIENT_ID,
      promotionTargetType: 'ingredient',
      expiresAt: new Date(Date.now() + 60_000),
      state: 'PROMOTED',
      storageKey: 'videos/source.mp4',
    });
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.metadata.create.mockResolvedValue({ id: 'metadata-1' });
    prisma.ingredient.create.mockResolvedValue({
      id: INGREDIENT_ID,
    });
    const createAsset = actions.get(
      YOUTUBE_LONG_FORM_ACTION_IDS.CREATE_SOURCE_LIBRARY_ASSET,
    );

    const result = await createAsset?.(
      actionRequest(
        {
          artifactId: 'artifact-source',
          ingredientId: INGREDIENT_ID,
        },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        s3Key: 'videos/source.mp4',
        sourceActionId:
          YOUTUBE_LONG_FORM_ACTION_IDS.CREATE_SOURCE_LIBRARY_ASSET,
        userId: 'user-1',
      }),
    });
    expect(result).toMatchObject({
      artifactId: 'artifact-source',
      status: 'linked',
    });
  });

  it('plans a deterministic tenant Library identity before retaining the source', async () => {
    prisma.workflowArtifact.findFirst.mockResolvedValue({
      execution: { userId: 'user-1' },
      metadata: {
        resolvedUrl: 'https://cdn.example.com/source.mp4',
        sourceTitle: DOCUMENT.title,
        videoId: DOCUMENT.videoId,
        youtubeUrl: DOCUMENT.youtubeUrl,
      },
      promotionTargetId: null,
      promotionTargetType: null,
      state: 'ACTIVE',
    });
    const planAsset = actions.get(
      YOUTUBE_LONG_FORM_ACTION_IDS.PLAN_SOURCE_LIBRARY_ASSET,
    );

    const result = await planAsset?.(
      actionRequest(
        { artifactId: 'artifact-source' },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    );

    expect(result).toMatchObject({
      artifactId: 'artifact-source',
      ingredientId: expect.any(String),
    });
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });
});

function actionRequest(
  input: Record<string, unknown>,
  context: { organizationId: string; userId: string } = {
    organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
    userId: PUBLIC_LONG_FORM_USER_ID,
  },
): SystemWorkflowActionRequest {
  return {
    context: {
      executionId: 'execution-1',
      organizationId: context.organizationId,
      runId: 'run-1',
      userId: context.userId,
      workflowId: 'workflow-1',
    },
    input,
    provenance: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowLabel: 'YouTube to Long-form Text',
    },
  } as SystemWorkflowActionRequest;
}
