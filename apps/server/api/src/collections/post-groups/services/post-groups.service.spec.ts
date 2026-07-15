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
    $transaction: ReturnType<typeof vi.fn>;
    brand: { findFirst: ReturnType<typeof vi.fn> };
    credential: { findMany: ReturnType<typeof vi.fn> };
    post: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    postGroup: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
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
          groupId: 'group-1',
          status: TargetExecutionState.SCHEDULED,
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
