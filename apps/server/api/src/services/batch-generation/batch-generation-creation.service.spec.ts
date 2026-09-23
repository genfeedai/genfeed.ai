import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
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
