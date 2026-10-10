import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  AgentArtifactReferenceService,
  PostLifecycleService,
} from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunCreationService } from '@api/services/turbo-run/turbo-run-creation.service';
import { TurboRunProcessingService } from '@api/services/turbo-run/turbo-run-processing.service';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import { TurboRunReviewLockService } from '@api/services/turbo-run/turbo-run-review-lock';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  TurboRunItemStatus,
  TurboRunStatus,
  ContentFormat,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TurboRunService approval version pins', () => {
  let artifactReferenceService: {
    createOrReuseVersionPin: ReturnType<typeof vi.fn>;
  };
  let turboRunDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let postDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let memberDelegate: {
    findMany: ReturnType<typeof vi.fn>;
  };
  let postLifecycleService: { transition: ReturnType<typeof vi.fn> };
  let service: TurboRunService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    turboRun: typeof turboRunDelegate;
    turboRunItem: { upsert: ReturnType<typeof vi.fn> };
    member: typeof memberDelegate;
    post: typeof postDelegate;
    postAnalytics: { findMany: ReturnType<typeof vi.fn> };
  };
  let publishApprovalsService: {
    createForCurrentPost: ReturnType<typeof vi.fn>;
    invalidatePost: ReturnType<typeof vi.fn>;
    toPublicInterface: ReturnType<typeof vi.fn>;
  };
  let reviewLocks: {
    assertActive: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };

  const createTurboRunRecord = (items: unknown[]) => ({
    brandId: 'brand-1',
    config: {},
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    id: 'batch-1',
    isDeleted: false,
    items,
    organizationId: 'org-1',
    status: TurboRunStatus.COMPLETED,
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
    userId: 'user-1',
  });

  beforeEach(async () => {
    const turboRunRecord = createTurboRunRecord([]);
    turboRunDelegate = {
      findFirst: vi.fn().mockResolvedValue(turboRunRecord),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...turboRunRecord,
          items: data.items,
        }),
      ),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        turboRunDelegate.findFirst.mockResolvedValue({
          ...turboRunRecord,
          ...data,
        });
        return Promise.resolve({ count: 1 });
      }),
    };
    postDelegate = {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'post-1', targetExecutionState: 'draft' }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    memberDelegate = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    artifactReferenceService = {
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    publishApprovalsService = {
      createForCurrentPost: vi.fn().mockResolvedValue({
        artifactVersionPinId: 'pin-1',
        id: 'approval-1',
      }),
      invalidatePost: vi.fn().mockResolvedValue(undefined),
      toPublicInterface: vi.fn((value) => value),
    };
    reviewLocks = {
      assertActive: vi.fn(),
      run: vi.fn(
        async (
          _turboRunIds: string[],
          _organizationId: string,
          operation: () => Promise<unknown>,
        ) => operation(),
      ),
    };
    postLifecycleService = {
      transition: vi.fn().mockResolvedValue({
        kind: 'transitioned',
        target: { id: 'post-1' },
      }),
    };
    prisma = {
      $transaction: vi.fn((callback) =>
        callback({
          $queryRaw: vi.fn(),
          turboRun: turboRunDelegate,
          turboRunItem: { upsert: vi.fn().mockResolvedValue({}) },
          post: postDelegate,
        }),
      ),
      turboRun: turboRunDelegate,
      turboRunItem: { upsert: vi.fn().mockResolvedValue({}) },
      member: memberDelegate,
      post: postDelegate,
      postAnalytics: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurboRunCreationService,
        TurboRunProcessingService,
        TurboRunReviewService,
        {
          provide: AutonomousPublishPolicyService,
          useValue: {
            assessPostMediaReasons: vi.fn().mockResolvedValue([]),
            recordReviewDecision: vi.fn(),
            resolveForPost: vi.fn(),
          },
        },
        { provide: PostLifecycleService, useValue: postLifecycleService },
        { provide: TurboRunReviewLockService, useValue: reviewLocks },
        {
          provide: ActivityRecorderService,
          useValue: { afterCommit: vi.fn(), recordInTransaction: vi.fn() },
        },
        TurboRunService,
        TurboRunSummaryService,
        {
          provide: AgentArtifactReferenceService,
          useValue: artifactReferenceService,
        },
        { provide: BrandsService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ContentGeneratorService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
        { provide: PostsService, useValue: {} },
        {
          provide: PublishApprovalsService,
          useValue: publishApprovalsService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(TurboRunService);
  });

  it('pins the canonical Post before recording approval', async () => {
    const item = {
      id: 'item-1',
      format: ContentFormat.IMAGE,
      postId: 'post-1',
      scheduledDate: '2026-07-14T10:00:00.000Z',
      status: TurboRunItemStatus.COMPLETED,
    };
    turboRunDelegate.findFirst.mockResolvedValue(createTurboRunRecord([item]));

    const result = await service.approveItems(
      'batch-1',
      ['item-1'],
      'org-1',
      'canonical-user-1',
    );

    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith({
      actorUserId: 'canonical-user-1',
      mode: 'scheduled',
      organizationId: 'org-1',
      postId: 'post-1',
      provenance: {
        turboRunId: 'batch-1',
        reviewItemId: 'item-1',
        surface: 'review-queue',
      },
      transaction: expect.objectContaining({
        turboRun: turboRunDelegate,
        post: postDelegate,
      }),
    });
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'canonical-user-1',
        mutation: expect.objectContaining({
          reviewDecision: 'APPROVED',
          reviewVersionPinId: 'pin-1',
          reviewedAt: expect.any(Date),
        }),
        nextState: 'scheduled',
        organizationId: 'org-1',
        postId: 'post-1',
      }),
      expect.objectContaining({
        turboRun: turboRunDelegate,
        post: postDelegate,
      }),
    );

    const persistedItems =
      turboRunDelegate.updateMany.mock.calls[0]?.[0].data.items;
    expect(persistedItems).toEqual([
      expect.objectContaining({
        reviewDecision: 'approved',
        reviewEvents: [
          expect.objectContaining({
            decision: 'approved',
            reviewerId: 'canonical-user-1',
            versionPinId: 'pin-1',
          }),
        ],
        versionPinId: 'pin-1',
      }),
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ versionPinId: 'pin-1' }),
    );
    expect(
      publishApprovalsService.createForCurrentPost.mock.invocationCallOrder[0],
    ).toBeLessThan(
      postLifecycleService.transition.mock.invocationCallOrder[0] ?? 0,
    );
    expect(reviewLocks.run).toHaveBeenCalledWith(
      ['batch-1'],
      'org-1',
      expect.any(Function),
    );
    expect(reviewLocks.run.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('attributes request-changes decisions to the canonical reviewer', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.requestChanges(
      'batch-1',
      ['item-1'],
      'org-1',
      'Use a clearer opening line.',
      'canonical-user-1',
    );

    expect(turboRunDelegate.updateMany).toHaveBeenCalledWith({
      data: {
        items: [
          expect.objectContaining({
            reviewDecision: 'request_changes',
            reviewEvents: [
              expect.objectContaining({
                decision: 'request_changes',
                feedback: 'Use a clearer opening line.',
                reviewerId: 'canonical-user-1',
              }),
            ],
          }),
        ],
      },
      where: {
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'canonical-user-1',
        nextState: 'draft',
        organizationId: 'org-1',
        postId: 'post-1',
        reason: 'Use a clearer opening line.',
      }),
      expect.objectContaining({ post: postDelegate }),
    );
  });

  it('attributes reject decisions to the canonical reviewer', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.rejectItems(
      'batch-1',
      ['item-1'],
      'org-1',
      'This misses the brief.',
      'canonical-user-1',
    );

    expect(turboRunDelegate.updateMany).toHaveBeenCalledWith({
      data: {
        items: [
          expect.objectContaining({
            reviewDecision: 'rejected',
            reviewEvents: [
              expect.objectContaining({
                decision: 'rejected',
                feedback: 'This misses the brief.',
                reviewerId: 'canonical-user-1',
              }),
            ],
          }),
        ],
      },
      where: {
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'canonical-user-1',
        mutation: expect.objectContaining({ isDeleted: true }),
        nextState: 'cancelled',
        organizationId: 'org-1',
        postId: 'post-1',
        reason: 'This misses the brief.',
      }),
      expect.objectContaining({ post: postDelegate }),
    );
  });

  it('fails before approval mutations when pin creation fails', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          scheduledDate: '2026-07-14T10:00:00.000Z',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );
    publishApprovalsService.createForCurrentPost.mockRejectedValue(
      new Error('Canonical Post changed.'),
    );

    await expect(
      service.approveItems('batch-1', ['item-1'], 'org-1', 'canonical-user-1'),
    ).rejects.toThrow('Canonical Post changed.');

    expect(postDelegate.updateMany).not.toHaveBeenCalled();
    expect(turboRunDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back Post reference state when the batch approval write fails', async () => {
    const item = {
      id: 'item-1',
      format: ContentFormat.IMAGE,
      postId: 'post-1',
      status: TurboRunItemStatus.COMPLETED,
    };
    turboRunDelegate.findFirst.mockResolvedValue(createTurboRunRecord([item]));

    const durableState = {
      turboRunItems: [item],
      postReviewDecision: null as string | null,
      postVersionPinId: null as string | null,
    };
    const transactionPost = {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'post-1', targetExecutionState: 'draft' }),
      updateMany: vi.fn().mockImplementation(({ data }) => {
        durableState.postReviewDecision = data.reviewDecision;
        durableState.postVersionPinId = data.reviewVersionPinId;
        return Promise.resolve({ count: 1 });
      }),
    };
    const transactionBatch = {
      findFirst: vi.fn().mockResolvedValue(createTurboRunRecord([item])),
      update: vi.fn().mockRejectedValue(new Error('batch write failed')),
      updateMany: vi.fn().mockRejectedValue(new Error('batch write failed')),
    };
    const transaction = {
      $queryRaw: vi.fn(),
      turboRun: transactionBatch,
      turboRunItem: { upsert: vi.fn().mockResolvedValue({}) },
      post: transactionPost,
    };
    prisma.$transaction.mockImplementationOnce(async (callback) => {
      const originalState = { ...durableState };
      try {
        return await callback(transaction);
      } catch (error: unknown) {
        Object.assign(durableState, originalState);
        throw error;
      }
    });

    await expect(
      service.approveItems('batch-1', ['item-1'], 'org-1', 'canonical-user-1'),
    ).rejects.toThrow('batch write failed');

    expect(durableState).toEqual({
      turboRunItems: [item],
      postReviewDecision: null,
      postVersionPinId: null,
    });
    expect(
      artifactReferenceService.createOrReuseVersionPin,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining(transaction),
      }),
    );
    expect(postDelegate.updateMany).not.toHaveBeenCalled();
    expect(turboRunDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('maps a missing canonical Post to the API NotFoundException convention', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );
    postDelegate.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await service
      .approveItems('batch-1', ['item-1'], 'org-1', 'canonical-user-1')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      detail: 'A canonical Post disappeared before approval completed.',
      title: 'Resource Not Found',
    });
    expect(turboRunDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('preserves legacy approval behavior for items without a canonical Post', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.approveItems(
      'batch-1',
      ['item-1'],
      'org-1',
      'canonical-user-1',
    );

    expect(
      artifactReferenceService.createOrReuseVersionPin,
    ).not.toHaveBeenCalled();
    expect(postDelegate.updateMany).not.toHaveBeenCalled();
    expect(turboRunDelegate.updateMany).toHaveBeenCalledWith({
      data: {
        items: [
          expect.objectContaining({
            reviewDecision: 'approved',
          }),
        ],
      },
      where: {
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    const persistedItems =
      turboRunDelegate.updateMany.mock.calls[0]?.[0].data.items;
    expect(persistedItems[0]).not.toHaveProperty('versionPinId');
  });

  it('hydrates an older batch item with the durable Post review pin', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );
    postDelegate.findMany.mockResolvedValue([
      {
        id: 'post-1',
        reviewVersionPinId: 'pin-from-post',
      },
    ]);

    const result = await service.getTurboRun('batch-1', 'org-1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({ versionPinId: 'pin-from-post' }),
    );
    expect(postDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ reviewVersionPinId: true }),
      }),
    );
  });

  it('hydrates reviewer identity only through an active organization membership', async () => {
    turboRunDelegate.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-1',
          format: ContentFormat.IMAGE,
          reviewEvents: [
            {
              decision: 'approved',
              reviewedAt: '2026-07-20T08:00:00.000Z',
              reviewerId: 'reviewer-1',
            },
            {
              decision: 'request_changes',
              reviewedAt: '2026-07-20T08:01:00.000Z',
              reviewerId: 'cross-org-reviewer',
            },
            {
              decision: 'rejected',
              reviewedAt: '2026-07-20T08:02:00.000Z',
              reviewerId: 'deleted-reviewer',
            },
            {
              decision: 'approved',
              reviewedAt: '2026-07-20T08:03:00.000Z',
            },
          ],
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );
    memberDelegate.findMany.mockResolvedValue([
      {
        organizationId: 'org-1',
        user: {
          avatar: 'https://cdn.example.com/reviewer.png',
          firstName: 'Ada',
          handle: 'ada',
          id: 'reviewer-1',
          isDeleted: false,
          lastName: 'Lovelace',
          name: null,
        },
      },
      {
        organizationId: 'org-2',
        user: {
          avatar: null,
          firstName: 'Other',
          handle: 'other',
          id: 'cross-org-reviewer',
          isDeleted: false,
          lastName: 'Tenant',
          name: null,
        },
      },
      {
        organizationId: 'org-1',
        user: {
          avatar: null,
          firstName: 'Deleted',
          handle: 'deleted',
          id: 'deleted-reviewer',
          isDeleted: true,
          lastName: 'Reviewer',
          name: null,
        },
      },
    ]);

    const result = await service.getTurboRun('batch-1', 'org-1');

    expect(memberDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: { in: ['org-1'] },
          userId: {
            in: ['reviewer-1', 'cross-org-reviewer', 'deleted-reviewer'],
          },
        },
      }),
    );
    expect(result.items[0]?.reviewEvents).toEqual([
      expect.objectContaining({
        reviewer: {
          avatar: 'https://cdn.example.com/reviewer.png',
          displayName: 'Ada Lovelace',
          handle: 'ada',
          id: 'reviewer-1',
        },
        reviewerId: 'reviewer-1',
      }),
      expect.objectContaining({
        reviewer: undefined,
        reviewerId: 'cross-org-reviewer',
      }),
      expect.objectContaining({
        reviewer: undefined,
        reviewerId: 'deleted-reviewer',
      }),
      expect.objectContaining({
        reviewer: undefined,
        reviewerId: undefined,
      }),
    ]);
  });
});

it('forwards internal strategy attribution after the idempotency key', async () => {
  const creation = { createTurboRun: vi.fn().mockResolvedValue({ id: 'turboRun' }) };
  const facade = new TurboRunService(
    creation as never,
    {} as never,
    {} as never,
  );
  const dto = {
    brandId: 'brand',
    count: 1,
    dateRange: { start: '2026-09-24', end: '2026-09-25' },
    platforms: ['instagram'],
  };
  await facade.createTurboRun(dto, 'owner', 'org', 'idempotency', 'strategy');
  expect(creation.createTurboRun).toHaveBeenCalledWith(
    dto,
    'owner',
    'org',
    'idempotency',
    'strategy',
  );
});
