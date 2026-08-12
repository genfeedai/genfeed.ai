import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReviewDecision,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deterministic coverage for the bootstrap review-inbox path.
 * Locks the query bounds that keep cold `/auth/bootstrap/overview` cheap.
 */
describe('BatchGenerationReviewService.getReviewInboxSummary', () => {
  const batch = {
    findMany: vi.fn(),
  };

  let service: BatchGenerationReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    batch.findMany.mockResolvedValue([]);
    service = new BatchGenerationReviewService(
      { batch } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('scans only recent non-cancelled batches with a hard take and slim select', async () => {
    await service.getReviewInboxSummary('org-1', 'brand-1', 5);

    expect(batch.findMany).toHaveBeenCalledTimes(1);
    expect(batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          id: true,
          items: true,
        },
        take: 50,
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: {
            in: [
              BatchStatus.PENDING,
              BatchStatus.PROCESSING,
              BatchStatus.COMPLETED,
              BatchStatus.PARTIAL,
              BatchStatus.FAILED,
            ],
          },
        }),
      }),
    );
  });

  it('counts ready items and returns the newest ready previews only', async () => {
    batch.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-08-12T12:00:00.000Z'),
        id: 'batch-new',
        items: [
          {
            createdAt: '2026-08-12T11:00:00.000Z',
            format: ContentFormat.IMAGE,
            id: 'ready-new',
            platform: 'instagram',
            postId: 'post-new',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.COMPLETED,
          },
          {
            format: ContentFormat.IMAGE,
            id: 'pending-1',
            platform: 'instagram',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.PENDING,
          },
        ],
      },
      {
        createdAt: new Date('2026-08-11T12:00:00.000Z'),
        id: 'batch-old',
        items: [
          {
            createdAt: '2026-08-11T10:00:00.000Z',
            format: ContentFormat.REEL,
            id: 'ready-old',
            platform: 'tiktok',
            postId: 'post-old',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.COMPLETED,
          },
          {
            format: ContentFormat.IMAGE,
            id: 'approved-1',
            platform: 'twitter',
            reviewDecision: ReviewDecision.APPROVED,
            status: BatchItemStatus.COMPLETED,
          },
        ],
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
      { batch } as never,
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
