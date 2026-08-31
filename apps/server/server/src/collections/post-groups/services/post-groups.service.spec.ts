import {
  ApiKeyScope,
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  PublishApprovalStatus,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { PostLifecycleService } from '@genfeedai/server';
import type { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CredentialPublishingReadinessService } from '@server/collections/credentials/services/credential-publishing-readiness.service';
import { PostGroupContractService } from '@server/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@server/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@server/collections/post-groups/services/post-group-readiness.service';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
import { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@server/collections/publish-approvals/services/publish-approvals.service';
import { PublishingProviderSetupService } from '@server/collections/publishing-setup/services/publishing-provider-setup.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

/**
 * Setup signals are not what these tests exercise, so every provider reads as
 * fully configured on a publicly reachable origin — readiness then reflects
 * token state alone.
 */
function buildFullyConfiguredSetupService(): PublishingProviderSetupService {
  return new PublishingProviderSetupService({
    get: (key: string) =>
      key.endsWith('_URI') || key.endsWith('_URL')
        ? 'https://app.example.com/oauth/callback'
        : `${key}-value`,
  } as unknown as ConfigService);
}

type MockPostGroup = {
  attachments: unknown;
  baseContent: string;
  brandId: string | null;
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  isDeleted: boolean;
  media: unknown;
  organizationId: string;
  ownerId: string;
  publishedAt: Date | null;
  recurrence: unknown;
  scheduledAt: Date | null;
  status: string;
  statusTransitions: unknown;
  timezone: string;
  title: string;
  updatedAt: Date;
};

type MockCredential = {
  accessToken: string | null;
  accessTokenExpiry: Date | null;
  accessTokenSecret: string | null;
  brandId: string | null;
  id: string;
  isConnected: boolean;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  organizationId: string;
  platform: string;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
};

type MockPostTarget = {
  agentContextSource: string | null;
  agentContextVersion: number | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  brandId: string | null;
  category: PostCategory;
  createdAt: Date;
  credentialId: string;
  description: string;
  externalId: string | null;
  externalShortcode: string | null;
  groupId: string | null;
  id: string;
  isDeleted: boolean;
  label: string | null;
  lastAttemptAt: Date | null;
  order: number;
  organizationId: string;
  platform: string;
  publishedAt: Date | null;
  retryCount: number;
  reviewVersionPinId?: string | null;
  publishApproval?: {
    artifactVersionPinId: string;
    id: string;
    operationId: string;
  } | null;
  publishApprovalId: string | null;
  scheduledDate: Date | null;
  targetAttachments: unknown;
  targetError: unknown;
  targetExecutionState: string;
  targetIdempotencyKey: string | null;
  targetReadiness: unknown;
  targetSettings: unknown;
  targetValidationIssues: string[];
  targetValidationState: string;
  timezone: string;
  updatedAt: Date;
  url: string | null;
  userId: string;
  visibility: PostVisibility;
  workflowExecutionId: string | null;
};

describe('PostGroupsService', () => {
  let service: PostGroupsService;
  let postLifecycleService: { transition: ReturnType<typeof vi.fn> };
  let postPublishQueueService: { enqueue: ReturnType<typeof vi.fn> };
  let publishApprovalsService: {
    createForCurrentPost: ReturnType<typeof vi.fn>;
    invalidatePost: ReturnType<typeof vi.fn>;
    markQueued: ReturnType<typeof vi.fn>;
    toPublicInterface: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
    brand: { findFirst: ReturnType<typeof vi.fn> };
    credential: { findMany: ReturnType<typeof vi.fn> };
    post: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    postGroup: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    publishApproval: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const now = new Date('2026-07-08T22:25:13.000Z');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      brand: {
        findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }),
      },
      credential: {
        findMany: vi.fn().mockResolvedValue([makeCredential()]),
      },
      post: {
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(makeTarget({ ...data, id: 'target-1' })),
          ),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      postGroup: {
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(makeGroup({ ...data, id: 'group-1' })),
          ),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(makeGroup({ ...data, id: 'group-1' })),
          ),
      },
      publishApproval: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    postPublishQueueService = {
      enqueue: vi.fn().mockResolvedValue('target-1'),
    };
    postLifecycleService = {
      transition: vi.fn().mockResolvedValue({
        kind: 'transitioned',
        target: { id: 'target-1' },
      }),
    };
    publishApprovalsService = {
      createForCurrentPost: vi.fn().mockResolvedValue({
        artifactVersionPinId: 'pin-1',
        id: 'approval-1',
        operationId: 'operation-1',
        provenance: {},
        status: PublishApprovalStatus.FAILED,
      }),
      invalidatePost: vi.fn().mockResolvedValue(undefined),
      markQueued: vi.fn().mockResolvedValue(undefined),
      toPublicInterface: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Readiness now lives in one credentials-owned service that the
        // scheduler delegates to, so the real collaborator has to be wired up.
        CredentialPublishingReadinessService,
        PostGroupContractService,
        PostGroupPersistenceService,
        PostGroupReadinessService,
        PostGroupsService,
        {
          provide: PublishingProviderSetupService,
          useValue: buildFullyConfiguredSetupService(),
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: PostLifecycleService,
          useValue: postLifecycleService,
        },
        {
          provide: ScheduledPostWorkflowQueueService,
          useValue: postPublishQueueService,
        },
        {
          provide: PublishApprovalsService,
          useValue: publishApprovalsService,
        },
      ],
    }).compile();

    service = module.get(PostGroupsService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('parses the validated calendar window before delegating to persistence', async () => {
    await expect(
      service.list('org-1', {
        brandId: 'brand-1',
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: '2026-07-20T00:00:00.000Z',
        status: [ReleaseStatus.SCHEDULED],
      }),
    ).resolves.toEqual(expect.objectContaining({ docs: [], totalDocs: 0 }));

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          isDeleted: false,
          parentId: null,
        }),
      }),
    );
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(
      prisma.postGroup.findMany.mock.calls[0]?.[0]?.where,
    ).not.toHaveProperty('status');
  });

  it('applies target-scoped calendar filters to the canonical projection', async () => {
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ scheduledAt: new Date('2026-07-21T09:00:00.000Z') }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        credentialId: 'credential-1',
        platform: CredentialPlatform.INSTAGRAM,
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);

    await expect(
      service.list('org-1', {
        contentType: [PostCategory.POST],
        credentialId: ['credential-1'],
        endDate: '2026-07-27T00:00:00.000Z',
        executionState: [TargetExecutionState.FAILED],
        platform: [CredentialPlatform.INSTAGRAM],
        source: [ReleaseTargetSource.WORKFLOW],
        startDate: '2026-07-20T00:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        docs: [expect.objectContaining({ id: 'group-1' })],
        totalDocs: 1,
      }),
    );
  });

  it('projects legacy ungrouped targets without admitting orphaned grouped targets', async () => {
    prisma.postGroup.findMany.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: null, id: 'legacy-target-1' }),
      makeTarget({ groupId: 'deleted-group', id: 'orphan-target-1' }),
    ]);

    await expect(
      service.list('org-1', { limit: 20, page: 1 }),
    ).resolves.toEqual(
      expect.objectContaining({
        docs: [
          expect.objectContaining({
            id: 'legacy-target-1',
            targets: [expect.objectContaining({ id: 'legacy-target-1' })],
          }),
        ],
        totalDocs: 1,
      }),
    );
  });

  it('preserves an ungrouped video post media when wrapping it as a release', async () => {
    const media = [
      { assetId: 'ingredient-1', kind: 'video', order: 0 },
      { assetId: 'ingredient-2', kind: 'video', order: 1 },
    ];
    prisma.post.findFirst.mockResolvedValue({
      ...makeTarget({
        category: PostCategory.VIDEO,
        groupId: null,
        id: 'post-1',
        platform: CredentialPlatform.TIKTOK,
      }),
      ingredients: [{ id: 'ingredient-1' }, { id: 'ingredient-2' }],
    });
    prisma.postGroup.findFirst.mockResolvedValue(makeGroup({ media }));
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        category: PostCategory.VIDEO,
        id: 'post-1',
        platform: CredentialPlatform.TIKTOK,
      }),
    ]);

    await service.ensureReleaseForPost('org-1', 'user-1', 'post-1');

    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { ingredients: { select: { id: true } } },
      }),
    );
    expect(prisma.postGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ media }),
      }),
    );
  });

  it('treats a partially published release as posted and not as not-posted', async () => {
    prisma.postGroup.findMany.mockResolvedValue([makeGroup()]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        id: 'target-published',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
      makeTarget({
        id: 'target-failed',
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);

    await expect(
      service.list('org-1', { publicationState: 'posted' }),
    ).resolves.toEqual(expect.objectContaining({ totalDocs: 1 }));
    await expect(
      service.list('org-1', { publicationState: 'not-posted' }),
    ).resolves.toEqual(expect.objectContaining({ totalDocs: 0 }));
  });

  it('paginates equal sort values with the release id as a stable tie-breaker', async () => {
    const createdAt = new Date('2026-07-08T22:25:13.000Z');
    prisma.postGroup.findMany.mockResolvedValue([
      makeGroup({ createdAt, id: 'group-b' }),
      makeGroup({ createdAt, id: 'group-a' }),
    ]);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: 'group-b', id: 'target-b' }),
      makeTarget({ groupId: 'group-a', id: 'target-a' }),
    ]);

    await expect(
      service.list('org-1', {
        limit: 1,
        page: 1,
        sort: 'createdAt: -1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        docs: [expect.objectContaining({ id: 'group-a' })],
        totalDocs: 2,
        totalPages: 2,
      }),
    );
    await expect(
      service.list('org-1', {
        limit: 1,
        page: 2,
        sort: 'createdAt: -1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        docs: [expect.objectContaining({ id: 'group-b' })],
        totalDocs: 2,
        totalPages: 2,
      }),
    );
  });

  it('returns a release with one batched exact-target analytics summary', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(makeGroup());
    prisma.post.findMany.mockResolvedValue([makeTarget()]);
    prisma.$queryRaw.mockResolvedValue([
      {
        brandId: 'brand-1',
        date: new Date('2026-07-21T00:00:00.000Z'),
        engagementRate: 0.14,
        id: 'analytics-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        postId: 'target-1',
        totalComments: 8,
        totalLikes: 55,
        totalSaves: 3,
        totalShares: 5,
        totalViews: 1000,
        updatedAt: new Date('2026-07-21T12:30:00.000Z'),
      },
    ]);

    const result = await service.getOne('org-1', 'group-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.targets?.[0]?.analytics).toMatchObject({
      snapshot: { likes: 55, views: 1000 },
      state: 'ready',
    });
  });

  it('creates a scheduled post group and channel target idempotently from the shared contract', async () => {
    const result = await service.create(
      'org-1',
      'user-1',
      {
        baseContent: 'Launch note for X',
        brandId: 'brand-1',
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            credentialId: 'cred-x',
            platform: CredentialPlatform.TWITTER,
            scheduledDate: '2026-07-09T12:00:00.000Z',
            settings: { replyPolicy: 'everyone' },
          },
        ],
        timezone: 'UTC',
        title: 'Launch note',
      },
      'same-request',
      {
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        workflowExecutionId: 'run-1',
        agentStrategyId: 'strategy-1',
        agentThreadId: 'thread-1',
        source: 'agent',
        sourceActionId: 'publish-card-1',
      },
    );

    expect(prisma.postGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'same-request',
          status: ReleaseStatus.SCHEDULED,
        }),
      }),
    );
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentContextSource: 'explicit',
          agentContextVersion: 3,
          workflowExecutionId: 'run-1',
          agentStrategyId: 'strategy-1',
          agentThreadId: 'thread-1',
          groupId: 'group-1',
          source: 'agent',
          sourceActionId: 'publish-card-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
          targetValidationState: TargetValidationState.VALID,
        }),
      }),
    );
    expect(result.status).toBe(ReleaseStatus.SCHEDULED);
    expect(result.targetSummary).toEqual({
      scheduled: 1,
      total: 1,
    });
  });

  it('persists a per-target caption override as the channel description', async () => {
    await service.create('org-1', 'user-1', {
      baseContent: 'Shared launch note',
      brandId: 'brand-1',
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          caption: 'X-specific launch note',
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
          settings: { replyPolicy: 'everyone' },
        },
      ],
      timezone: 'UTC',
      title: 'Launch note',
    });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'X-specific launch note',
        }),
      }),
    );
  });

  it('persists derived publishing readiness on every scheduled channel target', async () => {
    await service.create('org-1', 'user-1', {
      baseContent: 'Launch note for X',
      brandId: 'brand-1',
      status: ReleaseStatus.SCHEDULED,
      targets: [
        {
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        },
      ],
      timezone: 'UTC',
      title: 'Launch note',
    });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetReadiness: expect.objectContaining({
            canSchedule: true,
            credentialId: 'cred-x',
            state: 'publish_capable',
            tokenFreshness: 'pass',
          }),
        }),
      }),
    );
  });

  it('rejects a scheduled release whose channel credential cannot publish', async () => {
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    await expect(
      service.create('org-1', 'user-1', {
        baseContent: 'Launch note for X',
        brandId: 'brand-1',
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            credentialId: 'cred-x',
            platform: CredentialPlatform.TWITTER,
          },
        ],
        timezone: 'UTC',
        title: 'Launch note',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        classification: 'expired_credential',
        credentialId: 'cred-x',
        platform: CredentialPlatform.TWITTER,
        readinessState: 'blocked',
        title: 'Channel not ready to publish',
      }),
    });

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('lets a draft release be saved with a channel credential that cannot publish', async () => {
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    const result = await service.create('org-1', 'user-1', {
      baseContent: 'Launch note for X',
      brandId: 'brand-1',
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        },
      ],
      timezone: 'UTC',
      title: 'Launch note',
    });

    expect(result.status).toBe(ReleaseStatus.DRAFT);
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetReadiness: expect.objectContaining({
            canSchedule: false,
            state: 'blocked',
          }),
        }),
      }),
    );
  });

  it('replays an existing idempotent group without creating duplicates', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'existing-group', idempotencyKey: 'same-request' }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: 'existing-group', id: 'target-1' }),
    ]);

    const result = await service.create(
      'org-1',
      'user-1',
      {
        baseContent: 'Launch note for X',
        brandId: 'brand-1',
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            credentialId: 'cred-x',
            platform: CredentialPlatform.TWITTER,
          },
        ],
        timezone: 'UTC',
        title: 'Launch note',
      },
      'same-request',
    );

    expect(result.id).toBe('existing-group');
    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects a posts:create API key before scheduled writes', async () => {
    await expect(
      service.create(
        'org-1',
        'user-1',
        {
          baseContent: 'Launch note for X',
          brandId: 'brand-1',
          status: ReleaseStatus.SCHEDULED,
          targets: [
            {
              credentialId: 'cred-x',
              platform: CredentialPlatform.TWITTER,
            },
          ],
          timezone: 'UTC',
          title: 'Launch note',
        },
        undefined,
        undefined,
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_CREATE] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects an inferred schedule with a posts:create API key before writes', async () => {
    await expect(
      service.create(
        'org-1',
        'user-1',
        {
          baseContent: 'Launch note for X',
          brandId: 'brand-1',
          scheduledDate: '2026-07-09T12:00:00.000Z',
          targets: [
            {
              credentialId: 'cred-x',
              platform: CredentialPlatform.TWITTER,
            },
          ],
          timezone: 'UTC',
          title: 'Launch note',
        },
        undefined,
        undefined,
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_CREATE] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects a draft-scoped replay of an existing scheduled release', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        id: 'existing-group',
        idempotencyKey: 'same-request',
        status: ReleaseStatus.SCHEDULED,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ groupId: 'existing-group', id: 'target-1' }),
    ]);

    await expect(
      service.create(
        'org-1',
        'user-1',
        {
          baseContent: 'Launch note for X',
          brandId: 'brand-1',
          status: ReleaseStatus.DRAFT,
          targets: [
            {
              credentialId: 'cred-x',
              platform: CredentialPlatform.TWITTER,
            },
          ],
          timezone: 'UTC',
          title: 'Launch note',
        },
        'same-request',
        undefined,
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_DRAFT] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });

    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('requires publish scope to replay an existing published release', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        id: 'existing-group',
        idempotencyKey: 'same-request',
        status: ReleaseStatus.PUBLISHED,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'existing-group',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    ]);

    await expect(
      service.create(
        'org-1',
        'user-1',
        {
          baseContent: 'Launch note for X',
          brandId: 'brand-1',
          status: ReleaseStatus.DRAFT,
          targets: [
            {
              credentialId: 'cred-x',
              platform: CredentialPlatform.TWITTER,
            },
          ],
          timezone: 'UTC',
          title: 'Launch note',
        },
        'same-request',
        undefined,
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_SCHEDULE] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
      }),
    });

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects draft-scoped edits to an existing scheduled release', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.SCHEDULED }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({ targetExecutionState: TargetExecutionState.SCHEDULED }),
    ]);

    await expect(
      service.update(
        'org-1',
        'user-1',
        'group-1',
        { title: 'Changed title' },
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_CREATE] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });

    expect(prisma.postGroup.update).not.toHaveBeenCalled();
  });

  it('rejects target mutations without the schedule scope before reading data', async () => {
    await expect(
      service.updateTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        { timezone: 'Europe/Malta' },
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_DRAFT] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });

    expect(prisma.postGroup.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });

  it('does not let a schedule-scoped key forge a published target state', async () => {
    await expect(
      service.updateTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        { executionState: TargetExecutionState.PUBLISHED },
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_SCHEDULE] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
      }),
    });

    expect(prisma.postGroup.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });

  it('rejects scheduled targets that fail channel capability validation before writing', async () => {
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({
        id: 'cred-youtube',
        platform: CredentialPlatform.YOUTUBE,
      }),
    ]);

    await expect(
      service.create('org-1', 'user-1', {
        baseContent: 'Video launch',
        brandId: 'brand-1',
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            credentialId: 'cred-youtube',
            platform: CredentialPlatform.YOUTUBE,
          },
        ],
        timezone: 'UTC',
        title: 'Video launch',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('queues publish-now targets after scheduler state is committed', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status ?? ReleaseStatus.SCHEDULED,
          statusTransitions: data.statusTransitions ?? [],
        }),
      ),
    );

    const result = await service.publishNow('org-1', 'user-1', 'group-1');

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.SCHEDULED,
        postId: 'target-1',
      }),
      prisma,
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'target-1',
      source: 'publish_now',
      userId: 'user-1',
      versionPinId: 'pin-1',
    });
    expect(result.targets?.[0]?.id).toBe('target-1');
  });

  it('rejects a publish-now release whose channel credential cannot publish', async () => {
    // The agent immediate-publish path lands here: it saves an ungated draft and
    // publishes it in the next call, so publish-now is the only gate that runs.
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ]);
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    await expect(
      service.publishNow('org-1', 'user-1', 'group-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        classification: 'expired_credential',
        credentialId: 'cred-x',
        platform: CredentialPlatform.TWITTER,
        readinessState: 'blocked',
        title: 'Channel not ready to publish',
      }),
    });

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('resolves channel readiness inside the publish-now transaction before queueing', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status ?? ReleaseStatus.SCHEDULED,
          statusTransitions: data.statusTransitions ?? [],
        }),
      ),
    );

    await service.publishNow('org-1', 'user-1', 'group-1');

    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['cred-x'] },
          organizationId: 'org-1',
        }),
      }),
    );
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.SCHEDULED,
        postId: 'target-1',
      }),
      prisma,
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'target-1',
        source: 'publish_now',
      }),
    );
  });

  it('does not gate a publish-now release on targets it will not transition', async () => {
    // A cancelled sibling is never queued, so its credential must not decide
    // whether the actionable targets may publish.
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        credentialId: 'cred-cancelled',
        groupId: 'group-1',
        id: 'target-cancelled',
        targetExecutionState: TargetExecutionState.CANCELLED,
      }),
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status ?? ReleaseStatus.SCHEDULED,
          statusTransitions: data.statusTransitions ?? [],
        }),
      ),
    );

    await service.publishNow('org-1', 'user-1', 'group-1');

    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['cred-x'] } }),
      }),
    );
  });

  it('queues a publish-now target with its bound approval operation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        publishApproval: {
          artifactVersionPinId: 'pin-1',
          id: 'approval-1',
          operationId: 'operation-1',
        },
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status ?? ReleaseStatus.SCHEDULED,
          statusTransitions: data.statusTransitions ?? [],
        }),
      ),
    );

    await service.publishNow('org-1', 'user-1', 'group-1');

    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'target-1',
      source: 'publish_now',
      userId: 'user-1',
      versionPinId: 'pin-1',
    });
    expect(publishApprovalsService.markQueued).not.toHaveBeenCalled();
  });

  it('schedules a canonical target with a version-bound approval in the same transaction', async () => {
    const scheduledAt = '2026-07-09T12:00:00.000Z';
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        agentContextSource: null,
        agentContextVersion: null,
        agentThreadId: null,
        groupId: 'group-1',
        id: 'target-1',
        publishApproval: null,
        publishApprovalId: null,
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        agentThreadId: 'thread-1',
        groupId: 'group-1',
        id: 'target-1',
        scheduledDate: new Date(scheduledAt),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    const result = await service.scheduleTarget(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      scheduledAt,
      {
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        agentThreadId: 'thread-1',
      },
    );

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        guard: {
          expectedUpdatedAt: now,
          priorExecutionStates: [TargetExecutionState.DRAFT],
        },
        mutation: expect.objectContaining({
          agentContextSource: 'explicit',
          agentContextVersion: 3,
          agentThreadId: 'thread-1',
          scheduledDate: new Date(scheduledAt),
          targetValidationState: TargetValidationState.VALID,
        }),
        nextState: TargetExecutionState.SCHEDULED,
        organizationId: 'org-1',
        postId: 'target-1',
      }),
      prisma,
    );
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      contextVersion: 3,
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'target-1',
      provenance: {
        releaseId: 'group-1',
        surface: 'agent-schedule-post',
      },
      transaction: prisma,
    });
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
    expect(result.status).toBe(ReleaseStatus.SCHEDULED);
    expect(result.targets?.[0]).toEqual(
      expect.objectContaining({
        id: 'target-1',
        scheduledAt,
      }),
    );
  });

  it('publishes a target now with server time, skipping the future validator', async () => {
    // The old client path sent `new Date().toISOString()` through the strict
    // future validator; any clock skew made "Publish now" a 400 or a silent
    // schedule. The explicit action carries no timestamp at all.
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        publishApproval: null,
        publishApprovalId: null,
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        scheduledDate: now,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    await service.publishTargetNow('org-1', 'user-1', 'group-1', 'target-1', {
      source: 'post-desk',
    });

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          scheduledDate: now,
        }),
        nextState: TargetExecutionState.SCHEDULED,
        postId: 'target-1',
      }),
      prisma,
    );
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'immediate',
        postId: 'target-1',
        provenance: {
          releaseId: 'group-1',
          surface: 'post-desk-schedule',
        },
      }),
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'target-1',
        source: 'publish_now',
      }),
    );
  });

  it('queues a TikTok video app handoff through the scheduled-post workflow', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        id: 'group-1',
        media: [{ assetId: 'video-1', kind: 'video' }],
        status: ReleaseStatus.DRAFT,
      }),
    );
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({ platform: CredentialPlatform.TIKTOK }),
    ]);
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        category: PostCategory.VIDEO,
        groupId: 'group-1',
        id: 'target-1',
        platform: CredentialPlatform.TIKTOK,
        publishApproval: null,
        publishApprovalId: null,
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        category: PostCategory.VIDEO,
        groupId: 'group-1',
        id: 'target-1',
        platform: CredentialPlatform.TIKTOK,
        publishApproval: {
          artifactVersionPinId: 'pin-1',
          id: 'approval-1',
          operationId: 'operation-1',
        },
        scheduledDate: now,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    await service.publishTargetViaTikTokApp(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      { source: 'post-desk' },
    );

    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        postId: 'target-1',
        source: 'tiktok_app',
        userId: 'user-1',
      }),
    );
  });

  it('rejects a native-app handoff for non-TikTok targets', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        category: PostCategory.VIDEO,
        groupId: 'group-1',
        id: 'target-1',
        platform: CredentialPlatform.INSTAGRAM,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );

    await expect(
      service.publishTargetViaTikTokApp(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        { source: 'post-desk' },
      ),
    ).rejects.toThrow(
      'Publish via TikTok App is only available for TikTok videos.',
    );
    expect(postLifecycleService.transition).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('replays an exact canonical schedule without mutating the target or creating a second queue job', async () => {
    const scheduledAt = '2026-07-09T12:00:00.000Z';
    const target = makeTarget({
      agentContextSource: 'explicit',
      agentContextVersion: 3,
      agentThreadId: 'thread-1',
      groupId: 'group-1',
      id: 'target-1',
      scheduledDate: new Date(scheduledAt),
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.SCHEDULED }),
    );
    prisma.post.findFirst.mockResolvedValue(target);
    prisma.post.findMany.mockResolvedValue([target]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    await service.scheduleTarget(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      scheduledAt,
      {
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        agentThreadId: 'thread-1',
      },
    );

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledTimes(
      1,
    );
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects invalid schedule destination scope before durable mutation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.credential.findMany.mockResolvedValue([]);

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(prisma.postGroup.update).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('rejects an unsupported canonical target platform before durable mutation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        platform: 'unsupported-platform',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('not supported');

    expect(prisma.credential.findMany).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('rejects a disconnected canonical target credential before durable mutation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({ isConnected: false }),
    ]);

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('not connected');

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('rejects a canonical target whose credential cannot publish before durable mutation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.credential.findMany.mockResolvedValue([
      makeCredential({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        classification: 'expired_credential',
        credentialId: 'cred-x',
        readinessState: 'blocked',
        title: 'Channel not ready to publish',
      }),
    });

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('persists derived publishing readiness when a canonical target is scheduled', async () => {
    const scheduledAt = '2026-07-09T12:00:00.000Z';
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        scheduledDate: new Date(scheduledAt),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    await service.scheduleTarget(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      scheduledAt,
    );

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          targetReadiness: expect.objectContaining({
            canSchedule: true,
            credentialId: 'cred-x',
            state: 'publish_capable',
          }),
        }),
      }),
      prisma,
    );
  });

  it('rejects a canonical target without a valid release brand before durable mutation', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        brandId: null,
        id: 'group-1',
        status: ReleaseStatus.DRAFT,
      }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('missing a brand assignment');

    expect(prisma.credential.findMany).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('rejects a target whose brand differs from its canonical release', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ brandId: 'brand-1', id: 'group-1' }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        brandId: 'brand-2',
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('does not match its canonical release');

    expect(prisma.credential.findMany).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('rejects a stale target write before binding an approval', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    postLifecycleService.transition.mockResolvedValueOnce({ kind: 'stale' });

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('changed while scheduling');

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        guard: {
          expectedUpdatedAt: now,
          priorExecutionStates: [TargetExecutionState.DRAFT],
        },
        organizationId: 'org-1',
        postId: 'target-1',
      }),
      prisma,
    );
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('keeps target mutation and approval binding in one rollback boundary', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.DRAFT }),
    );
    prisma.post.findFirst.mockResolvedValue(
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        scheduledDate: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    publishApprovalsService.createForCurrentPost.mockRejectedValue(
      new Error('Version pin creation failed'),
    );

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('Version pin creation failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(postLifecycleService.transition).toHaveBeenCalledTimes(1);
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: prisma }),
    );
    expect(prisma.postGroup.update).not.toHaveBeenCalled();
  });

  it('rejects invalid and past schedule timestamps before querying or mutation', async () => {
    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        'not-a-date',
      ),
    ).rejects.toThrow('valid ISO 8601');
    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-08T22:25:11.000Z',
      ),
    ).rejects.toThrow('must be now or in the future');
    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00',
      ),
    ).rejects.toThrow('explicit UTC offset');

    expect(prisma.postGroup.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
  });

  it('pauses eligible targets and rolls the group up to paused', async () => {
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.SCHEDULED }),
    );
    prisma.post.findMany
      .mockResolvedValueOnce([
        makeTarget({
          groupId: 'group-1',
          id: 'target-1',
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      ])
      .mockResolvedValueOnce([
        makeTarget({
          groupId: 'group-1',
          id: 'target-1',
          targetExecutionState: TargetExecutionState.PAUSED,
        }),
      ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    const result = await service.pause('org-1', 'user-1', 'group-1');

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.PAUSED,
        postId: 'target-1',
      }),
      prisma,
    );
    expect(result.status).toBe(ReleaseStatus.PAUSED);
  });

  it('requeues a failed target through the canonical publish worker path', async () => {
    const failedTarget = makeTarget({
      groupId: 'group-1',
      id: 'target-1',
      lastAttemptAt: new Date('2026-07-16T00:00:00.000Z'),
      retryCount: 3,
      targetError: {
        code: 'rate_limited',
        isRetryable: false,
        message: 'Retry budget exhausted',
      },
      targetExecutionState: TargetExecutionState.FAILED,
    });
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.FAILED }),
    );
    prisma.post.findFirst.mockResolvedValue(failedTarget);
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        groupId: 'group-1',
        id: 'target-1',
        lastAttemptAt: null,
        retryCount: 0,
        targetError: null,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
    prisma.postGroup.update.mockImplementation(({ data }) =>
      Promise.resolve(
        makeGroup({
          id: 'group-1',
          status: data.status,
          statusTransitions: data.statusTransitions,
        }),
      ),
    );

    const result = await service.updateTarget(
      'org-1',
      'user-1',
      'group-1',
      'target-1',
      { executionState: TargetExecutionState.SCHEDULED },
    );

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({
          lastAttemptAt: null,
          retryCount: 0,
        }),
        error: null,
        nextState: TargetExecutionState.SCHEDULED,
        postId: 'target-1',
      }),
      prisma,
    );
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'target-1',
      provenance: {
        releaseId: 'group-1',
        surface: 'post-groups-manual-retry',
      },
      transaction: prisma,
    });
    expect(prisma.publishApproval.update).toHaveBeenCalledWith({
      data: {
        provenance: expect.objectContaining({
          manualRetryCommand: {
            releaseId: 'group-1',
            requestedByUserId: 'user-1',
            targetId: 'target-1',
            version: 1,
          },
        }),
      },
      where: { id: 'approval-1' },
    });
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'target-1',
      source: 'manual_retry',
      userId: 'user-1',
      versionPinId: 'pin-1',
    });
    expect(result.status).toBe(ReleaseStatus.SCHEDULED);
  });

  it('replays a durable manual-retry command when queue dispatch previously failed', async () => {
    const scheduledTarget = makeTarget({
      groupId: 'group-1',
      id: 'target-1',
      publishApprovalId: 'approval-1',
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({ id: 'group-1', status: ReleaseStatus.SCHEDULED }),
    );
    prisma.post.findFirst.mockResolvedValue(scheduledTarget);
    prisma.post.findMany.mockResolvedValue([scheduledTarget]);
    prisma.publishApproval.findFirst.mockResolvedValue({ id: 'approval-1' });
    publishApprovalsService.toPublicInterface.mockReturnValue({
      artifactVersionPinId: 'pin-1',
      id: 'approval-1',
      operationId: 'operation-1',
      provenance: {
        manualRetryCommand: {
          releaseId: 'group-1',
          requestedByUserId: 'user-1',
          targetId: 'target-1',
          version: 1,
        },
      },
      status: PublishApprovalStatus.QUEUED,
    });

    await service.updateTarget('org-1', 'user-1', 'group-1', 'target-1', {
      executionState: TargetExecutionState.SCHEDULED,
    });

    expect(publishApprovalsService.createForCurrentPost).not.toHaveBeenCalled();
    expect(publishApprovalsService.markQueued).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'target-1',
      source: 'manual_retry',
      userId: 'user-1',
      versionPinId: 'pin-1',
    });
  });

  it('moves calendar placement without enqueueing a publish or rewriting targets', async () => {
    const scheduledAt = '2026-08-02T09:00:00.000Z';
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
        status: ReleaseStatus.PUBLISHED,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    ]);

    await service.moveCalendarPlacement('org-1', 'user-1', 'group-1', {
      scheduledDate: scheduledAt,
    });

    expect(prisma.postGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { scheduledAt: new Date(scheduledAt) },
      }),
    );
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid calendar-move timestamp before writing', async () => {
    await expect(
      service.moveCalendarPlacement('org-1', 'user-1', 'group-1', {
        scheduledDate: 'not-a-date',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.postGroup.update).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('republishes a live post as one new scheduled target without enqueueing', async () => {
    const scheduledAt = '2026-07-09T12:00:00.000Z';
    const publishedGroup = makeGroup({
      status: ReleaseStatus.PUBLISHED,
    });
    prisma.postGroup.findFirst.mockImplementation(
      (args: { where?: { idempotencyKey?: string } } | undefined) => {
        if (args?.where?.idempotencyKey) {
          return Promise.resolve(null);
        }
        return Promise.resolve(publishedGroup);
      },
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        description: 'Base content',
        targetExecutionState: TargetExecutionState.PUBLISHED,
        targetSettings: { replyPolicy: 'everyone' },
      }),
    ]);
    prisma.postGroup.create.mockImplementation(({ data }) =>
      Promise.resolve(makeGroup({ ...data, id: 'group-2' })),
    );
    prisma.post.create.mockImplementation(({ data }) =>
      Promise.resolve(
        makeTarget({
          ...data,
          groupId: 'group-2',
          id: 'target-2',
        }),
      ),
    );

    const result = await service.republishAt('org-1', 'user-1', 'group-1', {
      scheduledDate: scheduledAt,
    });

    expect(prisma.postGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: `calendar-republish:group-1:${scheduledAt}`,
          scheduledAt: new Date(scheduledAt),
          status: ReleaseStatus.SCHEDULED,
        }),
      }),
    );
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'group-2',
          scheduledDate: new Date(scheduledAt),
          source: 'calendar-republish',
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      }),
    );
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
    expect(result.id).toBe('group-2');
    expect(result.status).toBe(ReleaseStatus.SCHEDULED);
    expect(result.targets).toHaveLength(1);
  });

  it('reschedules an unpublished past-due item in place without enqueueing', async () => {
    const scheduledAt = '2026-07-09T12:00:00.000Z';
    prisma.postGroup.findFirst.mockResolvedValue(
      makeGroup({
        scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
        status: ReleaseStatus.SCHEDULED,
      }),
    );
    prisma.post.findMany.mockResolvedValue([
      makeTarget({
        scheduledDate: new Date('2026-07-01T09:00:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);

    await service.republishAt('org-1', 'user-1', 'group-1', {
      scheduledDate: scheduledAt,
    });

    expect(prisma.postGroup.create).not.toHaveBeenCalled();
    expect(prisma.postGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: new Date(scheduledAt),
        }),
      }),
    );
    expect(prisma.post.updateMany).toHaveBeenCalled();
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });
});

function makeCredential(
  overrides: Partial<MockCredential> = {},
): MockCredential {
  return {
    accessToken: 'access-token-value',
    accessTokenExpiry: new Date('2026-09-01T00:00:00.000Z'),
    accessTokenSecret: null,
    brandId: 'brand-1',
    id: 'cred-x',
    isConnected: true,
    oauthToken: null,
    oauthTokenSecret: null,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    refreshToken: null,
    refreshTokenExpiry: null,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<MockPostGroup> = {}): MockPostGroup {
  return {
    attachments: [],
    baseContent: 'Base content',
    brandId: 'brand-1',
    createdAt: new Date('2026-07-08T22:25:13.000Z'),
    id: 'group-1',
    idempotencyKey: null,
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    publishedAt: null,
    recurrence: null,
    scheduledAt: null,
    status: ReleaseStatus.SCHEDULED,
    statusTransitions: [],
    timezone: 'UTC',
    title: 'Launch note',
    updatedAt: new Date('2026-07-08T22:25:13.000Z'),
    ...overrides,
  };
}

function makeTarget(overrides: Partial<MockPostTarget> = {}): MockPostTarget {
  return {
    agentContextSource: null,
    agentContextVersion: null,
    agentStrategyId: null,
    agentThreadId: null,
    brandId: 'brand-1',
    category: PostCategory.POST,
    createdAt: new Date('2026-07-08T22:25:13.000Z'),
    credentialId: 'cred-x',
    description: 'Base content',
    externalId: null,
    externalShortcode: null,
    groupId: 'group-1',
    id: 'target-1',
    isDeleted: false,
    label: 'Launch note',
    lastAttemptAt: null,
    order: 0,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishApproval: {
      artifactVersionPinId: 'pin-1',
      id: 'approval-1',
      operationId: 'operation-1',
    },
    publishApprovalId: 'approval-1',
    publishedAt: null,
    retryCount: 0,
    scheduledDate: null,
    targetAttachments: [],
    targetError: null,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    targetIdempotencyKey: null,
    targetReadiness: null,
    targetSettings: {},
    targetValidationIssues: [],
    targetValidationState: TargetValidationState.VALID,
    timezone: 'UTC',
    updatedAt: new Date('2026-07-08T22:25:13.000Z'),
    url: null,
    userId: 'user-1',
    visibility: PostVisibility.PUBLIC,
    workflowExecutionId: 'execution-1',
    ...overrides,
  };
}
