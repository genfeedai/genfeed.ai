import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReviewDecision,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
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
          continuityQa: {
            clips: [],
            completedAt: '2026-08-12T10:59:00.000Z',
            projectId: 'clip-project-1',
            referenceAssetIds: { character: [], product: [] },
            runId: 'clip-run-1',
            schemaVersion: 1,
            status: 'skipped',
            summary: {
              assessedClipCount: 0,
              driftClipCount: 0,
              errorClipCount: 0,
              totalClipCount: 0,
            },
          },
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
    expect(summary.recentItems[0]?.continuityQa).toMatchObject({
      runId: 'clip-run-1',
      status: 'skipped',
    });
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

describe('BatchGenerationReviewService harness review feedback', () => {
  const batch = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const batchItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const summaryService = {
    toBatchSummary: vi.fn((row) => row),
  };
  const postLifecycleService = { transition: vi.fn().mockResolvedValue({}) };
  const publishApprovalsService = {
    invalidatePost: vi.fn().mockResolvedValue(undefined),
  };
  const harnessReviewFeedbackService = {
    recordReviewDecision: vi.fn().mockResolvedValue(undefined),
  };

  let service: BatchGenerationReviewService;

  const createBatchRecord = (items: unknown[]) => ({
    brandId: 'brand-1',
    id: 'batch-1',
    items,
    organizationId: 'org-1',
    status: BatchStatus.PENDING,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    batch.updateMany.mockResolvedValue({ count: 1 });
    service = new BatchGenerationReviewService(
      { batch, batchItem } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      postLifecycleService as never,
      publishApprovalsService as never,
      summaryService as never,
      harnessReviewFeedbackService as never,
    );
  });

  it('feeds a rejected item back to the harness profile with the batch brand + item id', async () => {
    batch.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          caption: 'Buy now, limited time only!!!',
          id: 'item-1',
          postId: 'post-1',
          status: BatchItemStatus.COMPLETED,
        },
      ]),
    );

    await service.rejectItems(
      'batch-1',
      ['item-1'],
      'org-1',
      'Too salesy for our voice.',
      'user-1',
    );

    expect(
      harnessReviewFeedbackService.recordReviewDecision,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      content: 'Buy now, limited time only!!!',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      reason: 'Too salesy for our voice.',
      sourceId: 'item-1',
      sourceType: 'batch_item',
    });
  });

  it('feeds a request-changes item back to the harness profile', async () => {
    batch.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          id: 'item-2',
          postId: 'post-2',
          prompt: 'A generic stock-photo style render.',
          status: BatchItemStatus.COMPLETED,
        },
      ]),
    );

    await service.requestChanges(
      'batch-1',
      ['item-2'],
      'org-1',
      'Needs a more distinctive visual.',
    );

    expect(
      harnessReviewFeedbackService.recordReviewDecision,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      content: 'A generic stock-photo style render.',
      decision: ReviewDecision.REQUEST_CHANGES,
      organizationId: 'org-1',
      reason: 'Needs a more distinctive visual.',
      sourceId: 'item-2',
      sourceType: 'batch_item',
    });
  });

  it('skips items with no caption or prompt content', async () => {
    batch.findFirst.mockResolvedValue(
      createBatchRecord([
        { id: 'item-3', postId: 'post-3', status: BatchItemStatus.COMPLETED },
      ]),
    );

    await service.rejectItems('batch-1', ['item-3'], 'org-1');

    expect(
      harnessReviewFeedbackService.recordReviewDecision,
    ).not.toHaveBeenCalled();
  });

  it('never fails the review action when no harness feedback service is wired', async () => {
    batch.findFirst.mockResolvedValue(
      createBatchRecord([
        {
          caption: 'Rejected copy',
          id: 'item-4',
          postId: 'post-4',
          status: BatchItemStatus.COMPLETED,
        },
      ]),
    );
    const bareService = new BatchGenerationReviewService(
      { batch, batchItem } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      postLifecycleService as never,
      publishApprovalsService as never,
      summaryService as never,
    );

    await expect(
      bareService.rejectItems('batch-1', ['item-4'], 'org-1'),
    ).resolves.toBeDefined();
  });
});

describe('BatchGenerationReviewService assignment', () => {
  const batch = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const batchItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const member = {
    findFirst: vi.fn(),
  };
  const summaryService = {
    toBatchSummary: vi.fn((row) => row),
  };

  let service: BatchGenerationReviewService;

  function createBatchRecord() {
    return {
      brandId: 'brand-1',
      id: 'batch-1',
      items: [
        {
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: BatchItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    batch.findFirst.mockResolvedValue(createBatchRecord());
    batch.updateMany.mockResolvedValue({ count: 1 });
    member.findFirst.mockResolvedValue({
      id: 'member-1',
      user: { id: 'user-1', isDeleted: false },
    });
    service = new BatchGenerationReviewService(
      { batch, batchItem, member } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      summaryService as never,
    );
  });

  it('assigns a tenant-scoped active member without changing review decision', async () => {
    await service.assignItem('batch-1', 'item-1', 'user-1', 'org-1');

    expect(member.findFirst).toHaveBeenCalledWith({
      select: {
        id: true,
        user: {
          select: {
            id: true,
            isDeleted: true,
          },
        },
      },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
    expect(batch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'batch-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(batch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              assigneeId: 'user-1',
              id: 'item-1',
              reviewDecision: ReviewDecision.APPROVED,
            }),
          ],
        }),
        where: expect.objectContaining({
          id: 'batch-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(batchItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assigneeId: 'user-1',
          organizationId: 'org-1',
        }),
        update: expect.objectContaining({
          assigneeId: 'user-1',
        }),
      }),
    );
  });

  it('unassigns without changing the review decision', async () => {
    batch.findFirst.mockResolvedValue({
      ...createBatchRecord(),
      items: [
        {
          assigneeId: 'user-1',
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: BatchItemStatus.COMPLETED,
        },
      ],
    });

    await service.unassignItem('batch-1', 'item-1', 'org-1');

    expect(member.findFirst).not.toHaveBeenCalled();
    expect(batch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              assigneeId: null,
              id: 'item-1',
              reviewDecision: ReviewDecision.APPROVED,
            }),
          ],
        }),
      }),
    );
  });

  it('rejects assignment when the user is outside the organization', async () => {
    member.findFirst.mockResolvedValue(null);

    await expect(
      service.assignItem('batch-1', 'item-1', 'user-other-org', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(batch.updateMany).not.toHaveBeenCalled();
  });

  it('rejects assignment when the member is inactive', async () => {
    member.findFirst.mockResolvedValue(null);

    await expect(
      service.assignItem('batch-1', 'item-1', 'user-inactive', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects assignment when the user is soft-deleted', async () => {
    member.findFirst.mockResolvedValue({
      id: 'member-1',
      user: { id: 'user-deleted', isDeleted: true },
    });

    await expect(
      service.assignItem('batch-1', 'item-1', 'user-deleted', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(batch.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when the item is missing from the tenant-scoped batch', async () => {
    await expect(
      service.assignItem('batch-1', 'missing-item', 'user-1', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
