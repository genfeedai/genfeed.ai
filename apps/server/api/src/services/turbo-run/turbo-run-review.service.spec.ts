import { NotFoundException } from '@api/exceptions/not-found.exception';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { toPrismaTurboRunStatus } from '@api/services/turbo-run/turbo-run-status-prisma.mapper';
import {
  ContentFormat,
  ReviewDecision,
  TargetExecutionState,
  TurboRunItemStatus,
  TurboRunStatus,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deterministic coverage for the bootstrap review-inbox path.
 * Locks the query bounds that keep cold `/auth/bootstrap/overview` cheap.
 */
describe('TurboRunReviewService.getReviewInboxSummary', () => {
  const turboRunItem = {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  };

  let service: TurboRunReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    turboRunItem.findMany.mockResolvedValue([]);
    turboRunItem.groupBy.mockResolvedValue([]);
    service = new TurboRunReviewService(
      { turboRunItem } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
    );
  });

  it('counts and pages from typed turbo_run_items columns, not run JSON', async () => {
    await service.getReviewInboxSummary('org-1', 'brand-1', 5);

    expect(turboRunItem.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ['status', 'reviewDecision'],
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(turboRunItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 5,
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          reviewDecision: null,
          status: TurboRunItemStatus.COMPLETED,
        }),
      }),
    );
  });

  it('counts ready items and returns the newest ready previews only', async () => {
    turboRunItem.groupBy.mockResolvedValue([
      {
        _count: { _all: 2 },
        reviewDecision: null,
        status: TurboRunItemStatus.COMPLETED,
      },
      {
        _count: { _all: 1 },
        reviewDecision: null,
        status: TurboRunItemStatus.PENDING,
      },
      {
        _count: { _all: 1 },
        reviewDecision: 'APPROVED',
        status: TurboRunItemStatus.COMPLETED,
      },
    ]);
    turboRunItem.findMany.mockResolvedValue([
      {
        turboRunId: 'run-new',
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
        status: TurboRunItemStatus.COMPLETED,
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

describe('TurboRunReviewService.cancelTurboRun', () => {
  const turboRun = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const turboRunItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const summaryService = {
    toTurboRunSummary: vi.fn((row) => row),
  };

  let service: TurboRunReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    turboRun.findFirst.mockResolvedValue({
      id: 'run-1',
      items: [
        { id: 'item-1', status: TurboRunItemStatus.PENDING },
        { id: 'item-2', status: TurboRunItemStatus.COMPLETED },
      ],
      organizationId: 'org-1',
      status: TurboRunStatus.PENDING,
    });
    turboRun.updateMany.mockResolvedValue({ count: 1 });
    service = new TurboRunReviewService(
      {
        turboRun,
        turboRunItem,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            turboRun,
            turboRunItem,
            $queryRaw: vi.fn(),
            post: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'post-1',
                targetExecutionState: 'draft',
              }),
            },
          }),
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      summaryService as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
    );
  });

  it('cancels tenant-scoped and marks only pending items skipped', async () => {
    await service.cancelTurboRun('run-1', 'org-1');

    expect(turboRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'run-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(turboRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: toPrismaTurboRunStatus(TurboRunStatus.CANCELLED),
          items: [
            expect.objectContaining({
              id: 'item-1',
              status: TurboRunItemStatus.SKIPPED,
            }),
            expect.objectContaining({
              id: 'item-2',
              status: TurboRunItemStatus.COMPLETED,
            }),
          ],
        }),
        where: expect.objectContaining({
          id: 'run-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });
});

describe('TurboRunReviewService harness review feedback', () => {
  const turboRun = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const turboRunItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const summaryService = {
    toTurboRunSummary: vi.fn((row) => row),
  };
  const postLifecycleService = { transition: vi.fn().mockResolvedValue({}) };
  const publishApprovalsService = {
    invalidatePost: vi.fn().mockResolvedValue(undefined),
  };
  const harnessReviewFeedbackService = {
    recordReviewDecision: vi.fn().mockResolvedValue(undefined),
  };

  let service: TurboRunReviewService;

  const createTurboRunRecord = (items: unknown[]) => ({
    brandId: 'brand-1',
    id: 'run-1',
    items,
    organizationId: 'org-1',
    status: TurboRunStatus.PENDING,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    turboRun.updateMany.mockResolvedValue({ count: 1 });
    service = new TurboRunReviewService(
      {
        turboRun,
        turboRunItem,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            turboRun,
            turboRunItem,
            $queryRaw: vi.fn(),
            post: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'post-1',
                targetExecutionState: 'draft',
              }),
            },
          }),
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      postLifecycleService as never,
      publishApprovalsService as never,
      summaryService as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
      harnessReviewFeedbackService as never,
    );
  });

  it('feeds a rejected item back to the harness profile with the run brand + item id', async () => {
    turboRun.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          caption: 'Buy now, limited time only!!!',
          id: 'item-1',
          postId: 'post-1',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.rejectItems(
      'run-1',
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
      sourceType: 'turbo_run_item',
    });
  });

  it('feeds a request-changes item back to the harness profile', async () => {
    turboRun.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-2',
          postId: 'post-2',
          prompt: 'A generic stock-photo style render.',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.requestChanges(
      'run-1',
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
      sourceType: 'turbo_run_item',
    });
  });

  it('skips items with no caption or prompt content', async () => {
    turboRun.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          id: 'item-3',
          postId: 'post-3',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );

    await service.rejectItems('run-1', ['item-3'], 'org-1');

    expect(
      harnessReviewFeedbackService.recordReviewDecision,
    ).not.toHaveBeenCalled();
  });

  it('never fails the review action when no harness feedback service is wired', async () => {
    turboRun.findFirst.mockResolvedValue(
      createTurboRunRecord([
        {
          caption: 'Rejected copy',
          id: 'item-4',
          postId: 'post-4',
          status: TurboRunItemStatus.COMPLETED,
        },
      ]),
    );
    const bareService = new TurboRunReviewService(
      {
        turboRun,
        turboRunItem,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            turboRun,
            turboRunItem,
            $queryRaw: vi.fn(),
            post: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'post-1',
                targetExecutionState: 'draft',
              }),
            },
          }),
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      postLifecycleService as never,
      publishApprovalsService as never,
      summaryService as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
    );

    await expect(
      bareService.rejectItems('run-1', ['item-4'], 'org-1'),
    ).resolves.toBeDefined();
  });
});

describe('TurboRunReviewService assignment', () => {
  const turboRun = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const turboRunItem = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const member = {
    findFirst: vi.fn(),
  };
  const summaryService = {
    toTurboRunSummary: vi.fn((row) => row),
  };

  let service: TurboRunReviewService;

  function createTurboRunRecord() {
    return {
      brandId: 'brand-1',
      id: 'run-1',
      items: [
        {
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: TurboRunItemStatus.COMPLETED,
        },
      ],
      organizationId: 'org-1',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    turboRun.findFirst.mockResolvedValue(createTurboRunRecord());
    turboRun.updateMany.mockResolvedValue({ count: 1 });
    member.findFirst.mockResolvedValue({
      id: 'member-1',
      user: { id: 'user-1', isDeleted: false },
    });
    service = new TurboRunReviewService(
      { turboRun, turboRunItem, member } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      summaryService as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
    );
  });

  it('assigns a tenant-scoped active member without changing review decision', async () => {
    await service.assignItem('run-1', 'item-1', 'user-1', 'org-1');

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
    expect(turboRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(turboRun.updateMany).toHaveBeenCalledWith(
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
          id: 'run-1',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(turboRunItem.upsert).toHaveBeenCalledWith(
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
    turboRun.findFirst.mockResolvedValue({
      ...createTurboRunRecord(),
      items: [
        {
          assigneeId: 'user-1',
          id: 'item-1',
          reviewDecision: ReviewDecision.APPROVED,
          status: TurboRunItemStatus.COMPLETED,
        },
      ],
    });

    await service.unassignItem('run-1', 'item-1', 'org-1');

    expect(member.findFirst).not.toHaveBeenCalled();
    expect(turboRun.updateMany).toHaveBeenCalledWith(
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
      service.assignItem('run-1', 'item-1', 'user-other-org', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(turboRun.updateMany).not.toHaveBeenCalled();
  });

  it('rejects assignment when the member is inactive', async () => {
    member.findFirst.mockResolvedValue(null);

    await expect(
      service.assignItem('run-1', 'item-1', 'user-inactive', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects assignment when the user is soft-deleted', async () => {
    member.findFirst.mockResolvedValue({
      id: 'member-1',
      user: { id: 'user-deleted', isDeleted: true },
    });

    await expect(
      service.assignItem('run-1', 'item-1', 'user-deleted', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(turboRun.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when the item is missing from the tenant-scoped run', async () => {
    await expect(
      service.assignItem('run-1', 'missing-item', 'user-1', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TurboRunReviewService destination posts', () => {
  const turboRun = { findFirst: vi.fn(), updateMany: vi.fn() };
  const turboRunItem = { upsert: vi.fn().mockResolvedValue({}) };
  const postStates: Record<string, string> = {
    'dest-draft': TargetExecutionState.SCHEDULED,
    'dest-published': TargetExecutionState.PUBLISHED,
    'post-1': TargetExecutionState.SCHEDULED,
  };
  const post = {
    findFirst: vi.fn(async (args: { where: { id: string } }) =>
      postStates[args.where.id]
        ? {
            id: args.where.id,
            targetExecutionState: postStates[args.where.id],
            updatedAt: new Date(),
          }
        : null,
    ),
  };
  const postLifecycleService = { transition: vi.fn().mockResolvedValue({}) };
  const publishApprovalsService = {
    invalidatePost: vi.fn().mockResolvedValue(undefined),
  };
  let service: TurboRunReviewService;

  const reviewedTurboRun = (item: Record<string, unknown>) => ({
    brandId: 'brand-1',
    id: 'run-1',
    items: [
      {
        caption: 'Caption',
        id: 'item-1',
        postId: 'post-1',
        status: TurboRunItemStatus.COMPLETED,
        ...item,
      },
    ],
    organizationId: 'org-1',
    status: TurboRunStatus.COMPLETED,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    turboRun.updateMany.mockResolvedValue({ count: 1 });
    service = new TurboRunReviewService(
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $queryRaw: vi.fn(), turboRun, turboRunItem, post }),
        turboRun,
        turboRunItem,
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {} as never,
      postLifecycleService as never,
      publishApprovalsService as never,
      { toTurboRunSummary: vi.fn((row) => row) } as never,
      {
        assessPostMediaReasons: vi.fn().mockResolvedValue([]),
        recordReviewDecision: vi.fn(),
        resolveForPost: vi.fn(),
      } as never,
      { afterCommit: vi.fn(), recordInTransaction: vi.fn() } as never,
      {
        assertActive: vi.fn(),
        run: vi.fn(
          async (
            _ids: string[],
            _org: string,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      } as never,
    );
  });

  it('withdraws every unpublished destination post when changes are requested', async () => {
    turboRun.findFirst.mockResolvedValue(
      reviewedTurboRun({
        destinationPostIds: ['dest-draft', 'dest-published'],
        reviewDecision: ReviewDecision.APPROVED,
      }),
    );

    await service.requestChanges(
      'run-1',
      ['item-1'],
      'org-1',
      'Fix the hook',
      'user-1',
    );

    const invalidated = publishApprovalsService.invalidatePost.mock.calls.map(
      ([, postId]) => postId,
    );
    expect(invalidated).toEqual(
      expect.arrayContaining(['post-1', 'dest-draft']),
    );
    expect(invalidated).not.toContain('dest-published');
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.DRAFT,
        organizationId: 'org-1',
        postId: 'dest-draft',
      }),
      expect.anything(),
    );
  });

  it('cancels unpublished destination posts when the item is rejected', async () => {
    turboRun.findFirst.mockResolvedValue(
      reviewedTurboRun({ destinationPostIds: ['dest-draft'] }),
    );

    await service.rejectItems('run-1', ['item-1'], 'org-1', 'No', 'user-1');

    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: { isDeleted: true },
        nextState: TargetExecutionState.CANCELLED,
        postId: 'dest-draft',
      }),
      expect.anything(),
    );
  });

  it('records a destination post on its review item once', async () => {
    turboRun.findFirst.mockResolvedValue(
      reviewedTurboRun({ destinationPostIds: ['dest-draft'] }),
    );

    await service.linkDestinationPosts(
      'run-1',
      'item-1',
      ['dest-draft', 'dest-new', 'post-1'],
      'org-1',
    );

    const [write] = turboRun.updateMany.mock.calls[0];
    expect(write.data.items).toEqual([
      expect.objectContaining({
        destinationPostIds: ['dest-draft', 'dest-new'],
        id: 'item-1',
      }),
    ]);
  });
});
