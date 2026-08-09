import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BadRequestException } from '@nestjs/common';

describe('BatchGenerationCreationService manual review Post linking', () => {
  const prisma = {
    batch: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
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
