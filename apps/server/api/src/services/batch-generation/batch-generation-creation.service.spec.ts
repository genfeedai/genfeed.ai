import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { ContentFormat } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

describe('BatchGenerationCreationService manual review Post linking', () => {
  const prisma = {
    batch: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    batchItem: { upsert: vi.fn().mockResolvedValue({}) },
    ingredient: { findMany: vi.fn() },
    post: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const brandsService = { findOne: vi.fn() };
  const postsService = { create: vi.fn() };
  const cacheService = {};
  const summaryService = { toBatchSummary: vi.fn() };
  const service = new BatchGenerationCreationService(
    prisma as never,
    logger as never,
    brandsService as never,
    postsService as never,
    cacheService as never,
    summaryService as never,
  );
  const dto = {
    brandId: 'brand-1',
    items: [
      {
        caption: 'Review this generated post',
        format: 'post' as const,
        postId: 'post-1',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    brandsService.findOne.mockResolvedValue({ id: 'brand-1' });
    prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    prisma.batch.create.mockImplementation(({ data }) => ({
      ...data,
      id: 'batch-1',
    }));
    summaryService.toBatchSummary.mockImplementation((batch) => batch);
  });

  it('links an owned canonical Post without creating a duplicate', async () => {
    const result = await service.createManualReviewBatch(
      dto,
      'user-1',
      'org-1',
    );

    expect(postsService.create).not.toHaveBeenCalled();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewBatchId: 'batch-1' }),
        where: expect.objectContaining({
          brandId: 'brand-1',
          id: 'post-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'batch-1' });
  });

  it('restores a tombstoned Post that owns the tenant idempotency key', async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: 'post-tombstone-1',
      isDeleted: true,
    });

    await service.createManualReviewBatch(
      {
        brandId: 'brand-1',
        items: [
          {
            caption: 'Review this generated post',
            format: 'post',
            targetIdempotencyKey: 'run-1:variant-1',
          },
        ],
      },
      'user-1',
      'org-1',
    );

    expect(prisma.post.findFirst).toHaveBeenCalledWith({
      select: { id: true, isDeleted: true },
      where: {
        brandId: 'brand-1',
        organizationId: 'org-1',
        targetIdempotencyKey: 'run-1:variant-1',
      },
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: false },
      where: {
        brandId: 'brand-1',
        id: 'post-tombstone-1',
        isDeleted: true,
        organizationId: 'org-1',
      },
    });
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('rejects a Post outside the requested organization or brand', async () => {
    prisma.post.findMany.mockResolvedValue([]);

    await expect(
      service.createManualReviewBatch(dto, 'user-1', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.batch.create).not.toHaveBeenCalled();
  });

  it('never compensates by deleting an existing linked Post', async () => {
    prisma.batch.create.mockRejectedValue(new Error('batch write failed'));

    await expect(
      service.createManualReviewBatch(dto, 'user-1', 'org-1'),
    ).rejects.toThrow('batch write failed');
    expect(prisma.post.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDeleted: true } }),
    );
  });

  it('clears partial review links when batch linking fails', async () => {
    prisma.post.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      service.createManualReviewBatch(dto, 'user-1', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      data: { reviewBatchId: null, reviewItemId: null },
      where: expect.objectContaining({
        organizationId: 'org-1',
        reviewBatchId: 'batch-1',
      }),
    });
  });
});

describe('BatchGenerationCreationService platform normalize (#2696)', () => {
  const prisma = {
    batch: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    batchItem: { upsert: vi.fn().mockResolvedValue({}) },
    ingredient: { findMany: vi.fn() },
    post: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const brandsService = { findOne: vi.fn() };
  const postsService = { create: vi.fn() };
  const cacheService = {};
  const summaryService = { toBatchSummary: vi.fn() };
  const service = new BatchGenerationCreationService(
    prisma as never,
    logger as never,
    brandsService as never,
    postsService as never,
    cacheService as never,
    summaryService as never,
  );

  const baseDto = {
    brandId: 'brand-1',
    count: 2,
    dateRange: {
      end: '2026-08-20T00:00:00.000Z',
      start: '2026-08-12T00:00:00.000Z',
    },
    platforms: ['instagram'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    brandsService.findOne.mockResolvedValue({ id: 'brand-1' });
    prisma.batch.create.mockImplementation(({ data }) => ({
      ...data,
      id: 'batch-1',
    }));
    summaryService.toBatchSummary.mockImplementation((batch) => batch);
  });

  it('persists deduped domain platforms after free-text normalize', async () => {
    await service.createBatch(
      {
        ...baseDto,
        platforms: ['Instagram', 'x', 'INSTAGRAM', 'twitter'],
      },
      'user-1',
      'org-1',
    );

    expect(prisma.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            platforms: ['instagram', 'twitter'],
          }),
        }),
      }),
    );
  });

  it('rejects an empty platforms list before creating a batch', async () => {
    await expect(
      service.createBatch({ ...baseDto, platforms: [] }, 'user-1', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.batch.create).not.toHaveBeenCalled();
  });

  it('rejects unmappable platform ids so malformed strings never land', async () => {
    await expect(
      service.createBatch(
        { ...baseDto, platforms: ['instagram', 'myspace'] },
        'user-1',
        'org-1',
      ),
    ).rejects.toThrow(/Invalid batch platform/);

    expect(prisma.batch.create).not.toHaveBeenCalled();
  });
});

describe('BatchGenerationCreationService strategy attribution', () => {
  const dto = {
    brandId: 'brand',
    count: 1,
    dateRange: { start: '2026-09-24', end: '2026-09-25' },
    platforms: ['instagram'],
  };
  function setup(valid: boolean) {
    const prisma = {
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(valid ? { id: 'strategy' } : null),
      },
      batch: {
        create: vi
          .fn()
          .mockImplementation(async ({ data }) => ({ ...data, id: 'batch' })),
      },
      batchItem: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const service = new BatchGenerationCreationService(
      prisma as never,
      { log: vi.fn() } as never,
      { findOne: vi.fn().mockResolvedValue({ id: 'brand' }) } as never,
      {} as never,
      {} as never,
      { toBatchSummary: (batch: unknown) => batch } as never,
    );
    return { prisma, service };
  }
  it('persists validated same-tenant and same-brand attribution', async () => {
    const { prisma, service } = setup(true);
    await service.createBatch(dto, 'owner', 'org', undefined, 'strategy');
    expect(prisma.agentStrategy.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'strategy',
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
      },
      select: { id: true },
    });
    expect(prisma.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentStrategyId: 'strategy' }),
      }),
    );
  });
  it('rejects foreign/deleted/wrong-brand strategy before creating a batch', async () => {
    const { prisma, service } = setup(false);
    await expect(
      service.createBatch(dto, 'owner', 'org', undefined, 'strategy'),
    ).rejects.toThrow();
    expect(prisma.batch.create).not.toHaveBeenCalled();
  });
  it('keeps ordinary batches unattributed', async () => {
    const { prisma, service } = setup(false);
    await service.createBatch(dto, 'owner', 'org');
    expect(prisma.agentStrategy.findFirst).not.toHaveBeenCalled();
    expect(prisma.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentStrategyId: null }),
      }),
    );
  });
});

describe('BatchGenerationCreationService.appendManualReviewItems', () => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    batch: { findFirst: vi.fn(), updateMany: vi.fn() },
    batchItem: { upsert: vi.fn().mockResolvedValue({}) },
    post: { updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
    ingredient: { findMany: vi.fn() },
    post: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const postsService = { create: vi.fn() };
  const summaryService = { toBatchSummary: vi.fn() };
  const service = new BatchGenerationCreationService(
    prisma as never,
    logger as never,
    { findOne: vi.fn() } as never,
    postsService as never,
    {} as never,
    summaryService as never,
  );
  const existingItem = {
    format: 'image',
    id: 'item-existing',
    postId: 'post-existing',
    reviewDecision: 'unset',
    status: 'COMPLETED',
  };
  const batchRow = {
    brandId: 'brand-1',
    config: { completedCount: 1, source: 'manual', totalCount: 1 },
    id: 'batch-1',
    items: [existingItem],
    organizationId: 'org-1',
  };
  const dto = {
    brandId: 'brand-1',
    items: [
      {
        caption: 'Second output',
        format: ContentFormat.VIDEO,
        ingredientId: 'ingredient-2',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.ingredient.findMany.mockResolvedValue([{ id: 'ingredient-2' }]);
    postsService.create.mockResolvedValue({ id: 'post-2' });
    tx.batch.findFirst.mockResolvedValue(batchRow);
    tx.batch.updateMany.mockResolvedValue({ count: 1 });
    tx.post.updateMany.mockResolvedValue({ count: 1 });
    summaryService.toBatchSummary.mockImplementation((batch) => batch);
  });

  it('appends a new draft to the same review batch and links its Post', async () => {
    await service.appendManualReviewItems('batch-1', dto, 'user-1', 'org-1');

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        ingredients: ['ingredient-2'],
        organizationId: 'org-1',
      }),
    );
    const written = tx.batch.updateMany.mock.calls[0][0];
    expect(written.where).toMatchObject({
      id: 'batch-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(written.data.items).toHaveLength(2);
    expect(written.data.config).toMatchObject({
      completedCount: 2,
      totalCount: 2,
    });
    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewBatchId: 'batch-1' }),
        where: expect.objectContaining({ id: 'post-2' }),
      }),
    );
  });

  it('soft-deletes the created draft when the batch is gone', async () => {
    tx.batch.findFirst.mockResolvedValue(null);

    await expect(
      service.appendManualReviewItems('batch-1', dto, 'user-1', 'org-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDeleted: true },
        where: expect.objectContaining({ id: { in: ['post-2'] } }),
      }),
    );
  });

  it('returns the existing review item when the same source is appended again', async () => {
    tx.batch.findFirst.mockResolvedValue({
      ...batchRow,
      items: [
        existingItem,
        {
          format: 'video',
          id: 'item-already-appended',
          postId: 'post-2',
          reviewDecision: 'unset',
          sourceActionId: 'batch-project-item:project-item-2',
          status: 'COMPLETED',
        },
      ],
    });

    await service.appendManualReviewItems(
      'batch-1',
      {
        brandId: 'brand-1',
        items: [
          {
            caption: 'Second output',
            format: ContentFormat.VIDEO,
            ingredientId: 'ingredient-2',
            sourceActionId: 'batch-project-item:project-item-2',
          },
        ],
      },
      'user-1',
      'org-1',
    );

    const written = tx.batch.updateMany.mock.calls[0][0];
    expect(written.data.items).toHaveLength(2);
    expect(
      written.data.items.filter(
        (item: { sourceActionId?: string }) =>
          item.sourceActionId === 'batch-project-item:project-item-2',
      ),
    ).toEqual([expect.objectContaining({ id: 'item-already-appended' })]);
    expect(tx.post.updateMany).not.toHaveBeenCalled();
  });
});
