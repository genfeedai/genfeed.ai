import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BatchItemStatus, BatchStatus, ContentFormat } from '@genfeedai/enums';
import { AgentArtifactReferenceService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('BatchGenerationService approval version pins', () => {
  let artifactReferenceService: {
    createOrReuseVersionPin: ReturnType<typeof vi.fn>;
  };
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let postDelegate: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let service: BatchGenerationService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    batch: typeof batchDelegate;
    post: typeof postDelegate;
    postAnalytics: { findMany: ReturnType<typeof vi.fn> };
  };
  let publishApprovalsService: {
    createForCurrentPost: ReturnType<typeof vi.fn>;
    toPublicInterface: ReturnType<typeof vi.fn>;
  };

  const createBatchRecord = (items: unknown[]) => ({
    brandId: 'brand-1',
    config: {},
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    id: 'batch-1',
    isDeleted: false,
    items,
    organizationId: 'org-1',
    status: BatchStatus.COMPLETED,
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
    userId: 'user-1',
  });

  beforeEach(async () => {
    const batchRecord = createBatchRecord([]);
    batchDelegate = {
      findFirst: vi.fn().mockResolvedValue(batchRecord),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...batchRecord,
          items: data.items,
        }),
      ),
    };
    postDelegate = {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    artifactReferenceService = {
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    publishApprovalsService = {
      createForCurrentPost: vi.fn().mockResolvedValue({
        artifactVersionPinId: 'pin-1',
        id: 'approval-1',
      }),
      toPublicInterface: vi.fn((value) => value),
    };
    prisma = {
      $transaction: vi.fn((callback) =>
        callback({ batch: batchDelegate, post: postDelegate }),
      ),
      batch: batchDelegate,
      post: postDelegate,
      postAnalytics: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationService,
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

    service = module.get(BatchGenerationService);
  });

  it('pins the canonical Post before recording approval', async () => {
    const item = {
      _id: 'item-1',
      format: ContentFormat.IMAGE,
      postId: 'post-1',
      scheduledDate: '2026-07-14T10:00:00.000Z',
      status: BatchItemStatus.COMPLETED,
    };
    batchDelegate.findFirst.mockResolvedValue(createBatchRecord([item]));
    batchDelegate.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...createBatchRecord([]), items: data.items }),
    );

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
        batchId: 'batch-1',
        reviewItemId: 'item-1',
        surface: 'review-queue',
      },
      transaction: expect.objectContaining({
        batch: batchDelegate,
        post: postDelegate,
      }),
    });
    expect(postDelegate.updateMany).toHaveBeenCalledWith({
      data: {
        reviewDecision: 'APPROVED',
        reviewVersionPinId: 'pin-1',
        reviewedAt: expect.any(Date),
      },
      where: {
        id: 'post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });

    const persistedItems = batchDelegate.update.mock.calls[0]?.[0].data.items;
    expect(persistedItems).toEqual([
      expect.objectContaining({
        reviewDecision: 'approved',
        reviewEvents: [
          expect.objectContaining({
            decision: 'approved',
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
    ).toBeLessThan(postDelegate.updateMany.mock.invocationCallOrder[0] ?? 0);
  });

  it('fails before approval mutations when pin creation fails', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          _id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          scheduledDate: '2026-07-14T10:00:00.000Z',
          status: BatchItemStatus.COMPLETED,
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
    expect(batchDelegate.update).not.toHaveBeenCalled();
  });

  it('rolls back Post reference state when the batch approval write fails', async () => {
    const item = {
      _id: 'item-1',
      format: ContentFormat.IMAGE,
      postId: 'post-1',
      status: BatchItemStatus.COMPLETED,
    };
    batchDelegate.findFirst.mockResolvedValue(createBatchRecord([item]));

    const durableState = {
      batchItems: [item],
      postReviewDecision: null as string | null,
      postVersionPinId: null as string | null,
    };
    const transactionPost = {
      updateMany: vi.fn().mockImplementation(({ data }) => {
        durableState.postReviewDecision = data.reviewDecision;
        durableState.postVersionPinId = data.reviewVersionPinId;
        return Promise.resolve({ count: 1 });
      }),
    };
    const transactionBatch = {
      update: vi.fn().mockRejectedValue(new Error('batch write failed')),
    };
    const transaction = {
      batch: transactionBatch,
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
      batchItems: [item],
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
    expect(batchDelegate.update).not.toHaveBeenCalled();
  });

  it('maps a missing canonical Post to the API NotFoundException convention', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          _id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: BatchItemStatus.COMPLETED,
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
    expect(batchDelegate.update).not.toHaveBeenCalled();
  });

  it('preserves legacy approval behavior for items without a canonical Post', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          _id: 'item-1',
          format: ContentFormat.IMAGE,
          status: BatchItemStatus.COMPLETED,
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
    expect(batchDelegate.update).toHaveBeenCalledWith({
      data: {
        items: [
          expect.objectContaining({
            reviewDecision: 'approved',
            versionPinId: undefined,
          }),
        ],
      },
      where: { id: 'batch-1' },
    });
  });

  it('hydrates an older batch item with the durable Post review pin', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          _id: 'item-1',
          format: ContentFormat.IMAGE,
          postId: 'post-1',
          status: BatchItemStatus.COMPLETED,
        },
      ]),
    );
    postDelegate.findMany.mockResolvedValue([
      {
        id: 'post-1',
        reviewVersionPinId: 'pin-from-post',
      },
    ]);

    const result = await service.getBatch('batch-1', 'org-1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({ versionPinId: 'pin-from-post' }),
    );
    expect(postDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ reviewVersionPinId: true }),
      }),
    );
  });
});
