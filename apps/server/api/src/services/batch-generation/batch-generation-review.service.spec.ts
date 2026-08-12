import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import { BatchItemStatus, BatchStatus, ContentFormat } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deterministic coverage for the bootstrap review-inbox path.
 * Locks the query bounds that keep cold `/auth/bootstrap/overview` cheap.
 */
describe('BatchGenerationReviewService.getReviewInboxSummary', () => {
  const batchItem = {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  };

  let service: BatchGenerationReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    batchItem.findMany.mockResolvedValue([]);
    batchItem.groupBy.mockResolvedValue([]);
    service = new BatchGenerationReviewService(
      { batchItem } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('counts and pages from typed batch_items columns, not batch JSON', async () => {
    await service.getReviewInboxSummary('org-1', 'brand-1', 5);

    expect(batchItem.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ['status', 'reviewDecision'],
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(batchItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 5,
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          reviewDecision: null,
          status: BatchItemStatus.COMPLETED,
        }),
      }),
    );
  });

  it('counts ready items and returns the newest ready previews only', async () => {
    batchItem.groupBy.mockResolvedValue([
      {
        _count: { _all: 2 },
        reviewDecision: null,
        status: BatchItemStatus.COMPLETED,
      },
      {
        _count: { _all: 1 },
        reviewDecision: null,
        status: BatchItemStatus.PENDING,
      },
      {
        _count: { _all: 1 },
        reviewDecision: 'APPROVED',
        status: BatchItemStatus.COMPLETED,
      },
    ]);
    batchItem.findMany.mockResolvedValue([
      {
        batchId: 'batch-new',
        createdAt: new Date('2026-08-12T11:00:00.000Z'),
        data: {
          format: ContentFormat.IMAGE,
          platform: 'instagram',
          postId: 'post-new',
        },
        id: 'ready-new',
        status: BatchItemStatus.COMPLETED,
      },
    ]);

    const summary = await service.getReviewInboxSummary('org-1', undefined, 1);

    expect(summary.readyCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.approvedCount).toBe(1);
    expect(summary.recentItems).toHaveLength(1);
    expect(summary.recentItems[0]?.id).toBe('ready-new');
  });
});

describe('BatchGenerationReviewService.cancelBatch', () => {
  const batch = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const batchItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const summaryService = {
    toBatchSummary: vi.fn((row) => row),
  };

  let service: BatchGenerationReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      items: [
        { id: 'item-1', status: BatchItemStatus.PENDING },
        { id: 'item-2', status: BatchItemStatus.COMPLETED },
      ],
      organizationId: 'org-1',
      status: BatchStatus.PENDING,
    });
    batch.updateMany.mockResolvedValue({ count: 1 });
    service = new BatchGenerationReviewService(
      { batch, batchItem } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      summaryService as never,
    );
  });

  it('cancels tenant-scoped and marks only pending items skipped', async () => {
    await service.cancelBatch('batch-1', 'org-1');

    expect(batch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'batch-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(batch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: toPrismaBatchStatus(BatchStatus.CANCELLED),
          items: [
            expect.objectContaining({
              id: 'item-1',
              status: BatchItemStatus.SKIPPED,
            }),
            expect.objectContaining({
              id: 'item-2',
              status: BatchItemStatus.COMPLETED,
            }),
          ],
        }),
        where: expect.objectContaining({
          id: 'batch-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });
});
