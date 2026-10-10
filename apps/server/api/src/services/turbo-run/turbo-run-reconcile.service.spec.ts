import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { TURBO_RUN_MAX_RESUME_ATTEMPTS } from '@api/services/turbo-run/turbo-run.constants';
import { TurboRunCreditsService } from '@api/services/turbo-run/turbo-run-credits.service';
import { TurboRunReconcileService } from '@api/services/turbo-run/turbo-run-reconcile.service';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  TurboRunItemStatus,
  TurboRunStatus,
  ContentFormat,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CreditReservationServiceMock = {
  expireDue: ReturnType<typeof vi.fn>;
};

/**
 * Stranded-batch detection (#2501). Before this, an API reload mid-batch left
 * the row PROCESSING with nothing alive to finish it and nothing that could see
 * it was stuck. These cover what the sweep picks up, what it leaves alone, and
 * what it gives up on.
 */
describe('TurboRunReconcileService', () => {
  let service: TurboRunReconcileService;
  let pendingReviewPosts: ReturnType<typeof vi.fn>;
  let turboRunDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let creditsService: {
    retrySettlementShortfall: ReturnType<typeof vi.fn>;
    settleTurboRunCredits: ReturnType<typeof vi.fn>;
  };
  let reservationService: CreditReservationServiceMock;
  let generationBilling: {
    reconcile: ReturnType<typeof vi.fn>;
    reconcileLateCompletions: ReturnType<typeof vi.fn>;
    reconcileAbortedCrunDispatches: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const pendingItem = {
    format: ContentFormat.IMAGE,
    id: 'item-2',
    platform: 'instagram',
    status: TurboRunItemStatus.PENDING,
  };

  const completedItem = {
    format: ContentFormat.IMAGE,
    id: 'item-1',
    platform: 'instagram',
    postId: 'post-1',
    status: TurboRunItemStatus.COMPLETED,
  };

  beforeEach(async () => {
    pendingReviewPosts = vi.fn().mockResolvedValue([]);
    turboRunDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        config: { resumeCount: TURBO_RUN_MAX_RESUME_ATTEMPTS },
        items: [completedItem, pendingItem],
      }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    creditsService = {
      retrySettlementShortfall: vi.fn().mockResolvedValue(true),
      settleTurboRunCredits: vi.fn().mockResolvedValue({
        additionalCredits: 0,
        isAlreadySettled: false,
        refundCredits: 4,
        settledCredits: 4,
      }),
    };
    reservationService = { expireDue: vi.fn().mockResolvedValue(0) };
    generationBilling = {
      reconcile: vi.fn().mockResolvedValue(0),
      reconcileLateCompletions: vi.fn().mockResolvedValue(0),
      reconcileAbortedCrunDispatches: vi.fn().mockResolvedValue(0),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurboRunReconcileService,
        {
          provide: TurboRunReviewService,
          useValue: {
            expireAutonomousReviewTurboRun: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            turboRun: turboRunDelegate,
            post: { findMany: pendingReviewPosts },
            turboRunItem: { upsert: vi.fn().mockResolvedValue({}) },
          },
        },
        {
          provide: LoggerService,
          useValue: logger,
        },
        {
          provide: TurboRunCreditsService,
          useValue: creditsService,
        },
        {
          provide: CreditReservationService,
          useValue: reservationService,
        },
        {
          provide: GenerationBillingService,
          useValue: generationBilling,
        },
      ],
    }).compile();

    service = module.get(TurboRunReconcileService);
  });

  it('advances the expiry scan past pending drafts with longer review windows', async () => {
    pendingReviewPosts
      .mockResolvedValueOnce([
        { id: 'post-1', reviewTurboRunId: 'batch-1', organizationId: 'org-1' },
      ])
      .mockResolvedValueOnce([]);
    await service.expireAutonomousReviews(1);
    await service.expireAutonomousReviews(1);
    expect(pendingReviewPosts).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: 'post-1' }, skip: 1 }),
    );
  });

  it('reports a PROCESSING batch whose lease went stale', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: 1 },
        id: 'batch-1',
        organizationId: 'org-1',
        status: TurboRunStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedTurboRuns();

    expect(stranded).toEqual([
      {
        turboRunId: 'batch-1',
        organizationId: 'org-1',
        resumeCount: 1,
        userId: 'user-1',
      },
    ]);
  });

  it('reports a queued batch the workers never picked up', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: { queuedAt: '2026-08-07T09:00:00.000Z' },
        id: 'batch-2',
        organizationId: 'org-1',
        status: TurboRunStatus.PENDING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedTurboRuns();

    expect(stranded).toHaveLength(1);
    expect(stranded[0]?.turboRunId).toBe('batch-2');
    expect(stranded[0]?.resumeCount).toBe(0);
  });

  it('leaves a PENDING batch that was never handed to the queue alone', async () => {
    // A batch created but deliberately not run must not be auto-started by the
    // sweep — `queuedAt` is the only thing that says someone asked for it.
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: {},
        id: 'batch-3',
        organizationId: 'org-1',
        status: TurboRunStatus.PENDING,
        userId: 'user-1',
      },
    ]);

    await expect(service.findStrandedTurboRuns()).resolves.toEqual([]);
  });

  it('searches across organizations, bounded by the sweep limit', async () => {
    await service.findStrandedTurboRuns(7);

    const query = turboRunDelegate.findMany.mock.calls[0]?.[0];
    expect(query?.take).toBe(7);
    expect(query?.where?.isDeleted).toBe(false);
    expect(query?.where).not.toHaveProperty('organizationId');
    expect(query?.where?.OR).toEqual([
      expect.objectContaining({
        status: TurboRunStatus.PROCESSING,
        updatedAt: { lt: expect.any(Date) },
      }),
      expect.objectContaining({
        status: TurboRunStatus.PENDING,
        updatedAt: { lt: expect.any(Date) },
      }),
    ]);
  });

  it('fails out a batch that burned through its resume budget', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: TURBO_RUN_MAX_RESUME_ATTEMPTS },
        id: 'batch-4',
        organizationId: 'org-1',
        status: TurboRunStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedTurboRuns();

    // It is no longer work in flight — resuming it forever would loop.
    expect(stranded).toEqual([]);

    const update = turboRunDelegate.updateMany.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe(TurboRunStatus.FAILED);
    expect(update?.where).toEqual(
      expect.objectContaining({ id: 'batch-4', organizationId: 'org-1' }),
    );

    const items = update?.data?.items as Array<{
      error?: string;
      postId?: string;
      status: string;
    }>;
    // The draft that landed keeps its post; only the unfinished one fails.
    expect(items[0]).toEqual(
      expect.objectContaining({
        postId: 'post-1',
        status: TurboRunItemStatus.COMPLETED,
      }),
    );
    expect(items[1]?.status).toBe(TurboRunItemStatus.FAILED);
    expect(items[1]?.error).toMatch(/could not be resumed/iu);

    const config = update?.data?.config as {
      completedCount: number;
      failedCount: number;
    };
    expect(config.completedCount).toBe(1);
    expect(config.failedCount).toBe(1);
  });

  it('settles credits when it fails a batch out, so the run is not billed in full', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: TURBO_RUN_MAX_RESUME_ATTEMPTS + 1 },
        id: 'batch-5',
        organizationId: 'org-1',
        status: TurboRunStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    await service.findStrandedTurboRuns();

    expect(creditsService.settleTurboRunCredits).toHaveBeenCalledWith({
      turboRunId: 'batch-5',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('skips a batch that disappeared between the sweep and the write', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: TURBO_RUN_MAX_RESUME_ATTEMPTS },
        id: 'batch-6',
        organizationId: 'org-1',
        status: TurboRunStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);
    turboRunDelegate.findFirst.mockResolvedValue(null);

    await expect(service.findStrandedTurboRuns()).resolves.toEqual([]);
    expect(turboRunDelegate.updateMany).not.toHaveBeenCalled();
    expect(creditsService.settleTurboRunCredits).not.toHaveBeenCalled();
  });

  it('retries settlement from each durable shortfall marker', async () => {
    turboRunDelegate.findMany.mockResolvedValue([
      {
        id: 'batch-shortfall-1',
        organizationId: 'org-1',
        settlementShortfall: 7,
        settlementShortfallSeq: 2,
        userId: 'user-1',
      },
    ]);

    await service.reconcileSettlementShortfalls();

    expect(turboRunDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          settlementShortfall: { gt: 0 },
        },
      }),
    );
    expect(creditsService.retrySettlementShortfall).toHaveBeenCalledWith({
      turboRunId: 'batch-shortfall-1',
      organizationId: 'org-1',
      settlementShortfall: 7,
      settlementShortfallSeq: 2,
      userId: 'user-1',
    });
  });

  it('does not retry settlement when the marker is already clear', async () => {
    turboRunDelegate.findMany.mockResolvedValue([]);

    await service.reconcileSettlementShortfalls();

    expect(creditsService.retrySettlementShortfall).not.toHaveBeenCalled();
  });

  it('expires stale reservations on the existing credit reconciliation sweep', async () => {
    reservationService.expireDue.mockResolvedValue(3);

    await service.reconcileSettlementShortfalls();

    expect(reservationService.expireDue).toHaveBeenCalledOnce();
  });

  it('settles or releases ended generation holds before the generic expiry sweep', async () => {
    const order: string[] = [];
    generationBilling.reconcile.mockImplementation(async () => {
      order.push('generation');
      return 2;
    });
    reservationService.expireDue.mockImplementation(async () => {
      order.push('expiry');
      return 0;
    });

    await service.reconcileSettlementShortfalls();

    expect(order).toEqual(['generation', 'expiry']);
  });

  it('still charges late completions when the hold sweep fails', async () => {
    generationBilling.reconcile.mockRejectedValue(new Error('query failed'));

    await service.reconcileSettlementShortfalls();

    expect(generationBilling.reconcileLateCompletions).toHaveBeenCalledOnce();
    expect(
      generationBilling.reconcileAbortedCrunDispatches,
    ).toHaveBeenCalledOnce();
  });

  it('expires unrelated reservations when generation reconciliation fails', async () => {
    const failure = new Error('generation reconcile query failed');
    generationBilling.reconcile.mockRejectedValue(failure);

    await service.reconcileSettlementShortfalls();

    expect(reservationService.expireDue).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      'Generation hold reconciliation failed',
      failure,
    );
  });
});
