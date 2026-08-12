import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
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
