import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { BATCH_MAX_RESUME_ATTEMPTS } from '@api/services/batch-generation/batch-generation.constants';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
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
describe('BatchGenerationReconcileService', () => {
  let service: BatchGenerationReconcileService;
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let creditsService: {
    retrySettlementShortfall: ReturnType<typeof vi.fn>;
    settleBatchCredits: ReturnType<typeof vi.fn>;
  };
  let reservationService: CreditReservationServiceMock;

  const pendingItem = {
    format: ContentFormat.IMAGE,
    id: 'item-2',
    platform: 'instagram',
    status: BatchItemStatus.PENDING,
  };

  const completedItem = {
    format: ContentFormat.IMAGE,
    id: 'item-1',
    platform: 'instagram',
    postId: 'post-1',
    status: BatchItemStatus.COMPLETED,
  };

  beforeEach(async () => {
    batchDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        config: { resumeCount: BATCH_MAX_RESUME_ATTEMPTS },
        items: [completedItem, pendingItem],
      }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    creditsService = {
      retrySettlementShortfall: vi.fn().mockResolvedValue(true),
      settleBatchCredits: vi.fn().mockResolvedValue({
        additionalCredits: 0,
        isAlreadySettled: false,
        refundCredits: 4,
        settledCredits: 4,
      }),
    };
    reservationService = { expireDue: vi.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationReconcileService,
        {
          provide: PrismaService,
          useValue: {
            batch: batchDelegate,
            batchItem: { upsert: vi.fn().mockResolvedValue({}) },
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: BatchGenerationCreditsService,
          useValue: creditsService,
        },
        {
          provide: CreditReservationService,
          useValue: reservationService,
        },
      ],
    }).compile();

    service = module.get(BatchGenerationReconcileService);
  });

  it('reports a PROCESSING batch whose lease went stale', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: 1 },
        id: 'batch-1',
        organizationId: 'org-1',
        status: BatchStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedBatches();

    expect(stranded).toEqual([
      {
        batchId: 'batch-1',
        organizationId: 'org-1',
        resumeCount: 1,
        userId: 'user-1',
      },
    ]);
  });

  it('reports a queued batch the workers never picked up', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        config: { queuedAt: '2026-08-07T09:00:00.000Z' },
        id: 'batch-2',
        organizationId: 'org-1',
        status: BatchStatus.PENDING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedBatches();

    expect(stranded).toHaveLength(1);
    expect(stranded[0]?.batchId).toBe('batch-2');
    expect(stranded[0]?.resumeCount).toBe(0);
  });

  it('leaves a PENDING batch that was never handed to the queue alone', async () => {
    // A batch created but deliberately not run must not be auto-started by the
    // sweep — `queuedAt` is the only thing that says someone asked for it.
    batchDelegate.findMany.mockResolvedValue([
      {
        config: {},
        id: 'batch-3',
        organizationId: 'org-1',
        status: BatchStatus.PENDING,
        userId: 'user-1',
      },
    ]);

    await expect(service.findStrandedBatches()).resolves.toEqual([]);
  });

  it('searches across organizations, bounded by the sweep limit', async () => {
    await service.findStrandedBatches(7);

    const query = batchDelegate.findMany.mock.calls[0]?.[0];
    expect(query?.take).toBe(7);
    expect(query?.where?.isDeleted).toBe(false);
    expect(query?.where).not.toHaveProperty('organizationId');
    expect(query?.where?.OR).toEqual([
      expect.objectContaining({
        status: BatchStatus.PROCESSING,
        updatedAt: { lt: expect.any(Date) },
      }),
      expect.objectContaining({
        status: BatchStatus.PENDING,
        updatedAt: { lt: expect.any(Date) },
      }),
    ]);
  });

  it('fails out a batch that burned through its resume budget', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: BATCH_MAX_RESUME_ATTEMPTS },
        id: 'batch-4',
        organizationId: 'org-1',
        status: BatchStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    const stranded = await service.findStrandedBatches();

    // It is no longer work in flight — resuming it forever would loop.
    expect(stranded).toEqual([]);

    const update = batchDelegate.updateMany.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe(BatchStatus.FAILED);
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
        status: BatchItemStatus.COMPLETED,
      }),
    );
    expect(items[1]?.status).toBe(BatchItemStatus.FAILED);
    expect(items[1]?.error).toMatch(/could not be resumed/iu);

    const config = update?.data?.config as {
      completedCount: number;
      failedCount: number;
    };
    expect(config.completedCount).toBe(1);
    expect(config.failedCount).toBe(1);
  });

  it('settles credits when it fails a batch out, so the run is not billed in full', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: BATCH_MAX_RESUME_ATTEMPTS + 1 },
        id: 'batch-5',
        organizationId: 'org-1',
        status: BatchStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);

    await service.findStrandedBatches();

    expect(creditsService.settleBatchCredits).toHaveBeenCalledWith({
      batchId: 'batch-5',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('skips a batch that disappeared between the sweep and the write', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        config: { resumeCount: BATCH_MAX_RESUME_ATTEMPTS },
        id: 'batch-6',
        organizationId: 'org-1',
        status: BatchStatus.PROCESSING,
        userId: 'user-1',
      },
    ]);
    batchDelegate.findFirst.mockResolvedValue(null);

    await expect(service.findStrandedBatches()).resolves.toEqual([]);
    expect(batchDelegate.updateMany).not.toHaveBeenCalled();
    expect(creditsService.settleBatchCredits).not.toHaveBeenCalled();
  });

  it('retries settlement from each durable shortfall marker', async () => {
    batchDelegate.findMany.mockResolvedValue([
      {
        id: 'batch-shortfall-1',
        organizationId: 'org-1',
        settlementShortfall: 7,
        settlementShortfallSeq: 2,
        userId: 'user-1',
      },
    ]);

    await service.reconcileSettlementShortfalls();

    expect(batchDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          settlementShortfall: { gt: 0 },
        },
      }),
    );
    expect(creditsService.retrySettlementShortfall).toHaveBeenCalledWith({
      batchId: 'batch-shortfall-1',
      organizationId: 'org-1',
      settlementShortfall: 7,
      settlementShortfallSeq: 2,
      userId: 'user-1',
    });
  });

  it('does not retry settlement when the marker is already clear', async () => {
    batchDelegate.findMany.mockResolvedValue([]);

    await service.reconcileSettlementShortfalls();

    expect(creditsService.retrySettlementShortfall).not.toHaveBeenCalled();
  });

  it('expires stale reservations on the existing credit reconciliation sweep', async () => {
    reservationService.expireDue.mockResolvedValue(3);

    await service.reconcileSettlementShortfalls();

    expect(reservationService.expireDue).toHaveBeenCalledOnce();
  });
});
