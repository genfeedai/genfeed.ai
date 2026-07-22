import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PublishApprovalStatus,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { PostPublishQueueService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

type MockPostTarget = {
  agentContextSource: string | null;
  agentContextVersion: number | null;
  agentRunId: string | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  brandId: string | null;
  createdAt: Date;
  credentialId: string;
  externalId: string | null;
  externalShortcode: string | null;
  groupId: string;
  id: string;
  isDeleted: boolean;
  lastAttemptAt: Date | null;
  order: number;
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
  workflowExecutionId: string | null;
};

describe('PostGroupsService', () => {
  let service: PostGroupsService;
  let postPublishQueueService: { enqueue: ReturnType<typeof vi.fn> };
  let publishApprovalsService: {
    createForCurrentPost: ReturnType<typeof vi.fn>;
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
        findMany: vi.fn().mockResolvedValue([
          {
            brandId: 'brand-1',
            id: 'cred-x',
            isConnected: true,
            organizationId: 'org-1',
            platform: CredentialPlatform.TWITTER,
          },
        ]),
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
    publishApprovalsService = {
      createForCurrentPost: vi.fn().mockResolvedValue({
        artifactVersionPinId: 'pin-1',
        id: 'approval-1',
        operationId: 'operation-1',
        provenance: {},
        status: PublishApprovalStatus.FAILED,
      }),
      markQueued: vi.fn().mockResolvedValue(undefined),
      toPublicInterface: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostGroupContractService,
        PostGroupPersistenceService,
        PostGroupsService,
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
          provide: PostPublishQueueService,
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
    ).resolves.toEqual([]);

    expect(prisma.post.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          scheduledDate: {
            gte: new Date('2026-07-20T00:00:00.000Z'),
            lte: new Date('2026-07-27T00:00:00.000Z'),
          },
        }),
      }),
    );
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          status: { in: [ReleaseStatus.SCHEDULED] },
        }),
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
        agentRunId: 'run-1',
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
          agentRunId: 'run-1',
          agentStrategyId: 'strategy-1',
          agentThreadId: 'thread-1',
          groupId: 'group-1',
          source: 'agent',
          status: TargetExecutionState.SCHEDULED,
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

  it('rejects scheduled targets that fail channel capability validation before writing', async () => {
    prisma.credential.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'cred-youtube',
        isConnected: true,
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
      },
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

    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      }),
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
    expect(publishApprovalsService.markQueued).toHaveBeenCalledWith(
      'approval-1',
      'org-1',
      'user-1',
    );
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

    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        agentThreadId: 'thread-1',
        scheduledDate: new Date(scheduledAt),
        status: TargetExecutionState.SCHEDULED,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        targetValidationState: TargetValidationState.VALID,
      }),
      where: {
        groupId: 'group-1',
        id: 'target-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: TargetExecutionState.DRAFT,
        updatedAt: now,
      },
    });
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
      {
        brandId: 'brand-1',
        id: 'cred-x',
        isConnected: false,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      },
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
    prisma.post.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.scheduleTarget(
        'org-1',
        'user-1',
        'group-1',
        'target-1',
        '2026-07-09T12:00:00.000Z',
      ),
    ).rejects.toThrow('changed while scheduling');

    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 'group-1',
          id: 'target-1',
          isDeleted: false,
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.DRAFT,
          updatedAt: now,
        }),
      }),
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
    expect(prisma.post.updateMany).toHaveBeenCalledTimes(1);
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
        '2026-07-08T22:25:13.000Z',
      ),
    ).rejects.toThrow('must be in the future');
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
    prisma.post.findMany.mockResolvedValue([
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

    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.PAUSED,
        }),
      }),
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

    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastAttemptAt: null,
          retryCount: 0,
          status: TargetExecutionState.SCHEDULED,
          targetError: expect.anything(),
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      }),
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
});

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
    agentRunId: null,
    agentStrategyId: null,
    agentThreadId: null,
    brandId: 'brand-1',
    createdAt: new Date('2026-07-08T22:25:13.000Z'),
    credentialId: 'cred-x',
    externalId: null,
    externalShortcode: null,
    groupId: 'group-1',
    id: 'target-1',
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
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
    workflowExecutionId: 'execution-1',
    ...overrides,
  };
}
