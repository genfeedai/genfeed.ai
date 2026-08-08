import {
  BATCH_LEASE_STALE_MS,
  BATCH_MAX_RESUME_ATTEMPTS,
  BATCH_QUEUE_PICKUP_STALE_MS,
  BATCH_RECONCILE_SWEEP_LIMIT,
} from '@api/services/batch-generation/batch-generation.constants';
import {
  type BatchConfig,
  cloneBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BatchItemStatus, BatchStatus } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** A batch whose run died and which the sweep wants handed back to the queue. */
export type StrandedBatch = {
  batchId: string;
  organizationId: string;
  /** How many previous runs already gave up on this batch. */
  resumeCount: number;
  userId: string;
};

/**
 * Finds batches whose run disappeared.
 *
 * Before batch processing moved onto BullMQ it ran as an in-process promise in
 * the API: an API reload mid-batch left the row PROCESSING with nothing alive
 * to finish it, and nothing that could see it was stuck. Queueing fixes the
 * common case — BullMQ redelivers a stalled job — but a batch can still be
 * orphaned by an enqueue that never landed, or by a job dropped after its
 * retries. This sweep is the backstop for both.
 *
 * It reads across organizations by design: it is a platform maintenance sweep,
 * not a tenant-facing query, and every result carries its own `organizationId`
 * so downstream work stays scoped.
 */
@Injectable()
export class BatchGenerationReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly creditsService: BatchGenerationCreditsService,
  ) {}

  /**
   * Return batches that should be re-enqueued, and fail out the ones that have
   * burned through their resume budget.
   *
   * Two shapes are stranded:
   * - **PROCESSING with a stale lease** — a run claimed it and died. Every item
   *   persist bumps `updatedAt`, so a lease older than `BATCH_LEASE_STALE_MS`
   *   means no live run is touching it.
   * - **PENDING with `queuedAt` set but never picked up** — the batch was
   *   handed to the queue and the job was lost. `queuedAt` is what keeps the
   *   sweep from auto-starting batches that were deliberately created and not
   *   run.
   */
  async findStrandedBatches(
    limit: number = BATCH_RECONCILE_SWEEP_LIMIT,
  ): Promise<StrandedBatch[]> {
    const now = Date.now();
    const leaseStaleBefore = new Date(now - BATCH_LEASE_STALE_MS);
    const pickupStaleBefore = new Date(now - BATCH_QUEUE_PICKUP_STALE_MS);

    // tenant-scope-ignore: platform maintenance sweep — it must see stranded batches across every organization, and each result carries its own organizationId so all downstream work stays scoped
    const candidates = await this.prisma.batch.findMany({
      orderBy: { updatedAt: 'asc' },
      select: {
        config: true,
        id: true,
        organizationId: true,
        status: true,
        userId: true,
      },
      take: limit,
      where: {
        OR: [
          {
            status: toPrismaBatchStatus(BatchStatus.PROCESSING),
            updatedAt: { lt: leaseStaleBefore },
          },
          {
            config: { not: Prisma.DbNull, path: ['queuedAt'] },
            status: toPrismaBatchStatus(BatchStatus.PENDING),
            updatedAt: { lt: pickupStaleBefore },
          },
        ],
        isDeleted: false,
      },
    });

    const stranded: StrandedBatch[] = [];

    for (const candidate of candidates) {
      const config = (candidate.config ?? {}) as BatchConfig;

      // The JSON-path filter above already excludes never-queued PENDING rows;
      // re-check in code so the guarantee does not rest on filter semantics.
      if (
        candidate.status === toPrismaBatchStatus(BatchStatus.PENDING) &&
        !config.queuedAt
      ) {
        continue;
      }

      const resumeCount = config.resumeCount ?? 0;
      if (resumeCount >= BATCH_MAX_RESUME_ATTEMPTS) {
        await this.failExhaustedBatch({
          batchId: candidate.id,
          organizationId: candidate.organizationId,
          resumeCount,
          userId: candidate.userId,
        });
        continue;
      }

      stranded.push({
        batchId: candidate.id,
        organizationId: candidate.organizationId,
        resumeCount,
        userId: candidate.userId,
      });
    }

    if (stranded.length > 0) {
      this.logger.warn(`Found ${stranded.length} stranded batches to resume`, {
        batchIds: stranded.map((batch) => batch.batchId),
      });
    }

    return stranded;
  }

  /**
   * Give up on a batch that keeps dying. Unfinished items are marked FAILED so
   * the batch stops looking like work in flight, then credits are settled — the
   * ledger bills only the drafts that actually landed, so the customer is made
   * whole for everything this batch never produced.
   */
  private async failExhaustedBatch(params: {
    batchId: string;
    organizationId: string;
    resumeCount: number;
    userId: string;
  }): Promise<void> {
    const batch = await this.prisma.batch.findFirst({
      select: { config: true, items: true },
      where: scopedWhere(params.organizationId, { id: params.batchId }),
    });

    if (!batch) {
      return;
    }

    const config = (batch.config ?? {}) as BatchConfig;
    const items = cloneBatchItems(batch.items).map((item) =>
      item.status === BatchItemStatus.COMPLETED ||
      item.status === BatchItemStatus.FAILED
        ? item
        : {
            ...item,
            error: 'Batch run was interrupted and could not be resumed',
            status: BatchItemStatus.FAILED,
          },
    );

    const completedCount = items.filter(
      (item) => item.status === BatchItemStatus.COMPLETED,
    ).length;

    // Name the shape before the cast. An inline literal widens the optional
    // nested config objects, and the spec tsconfig then rejects the direct
    // `as Prisma.InputJsonValue` conversion as non-overlapping.
    const completedConfig: BatchConfig = {
      ...config,
      completedAt: new Date().toISOString(),
      completedCount,
      failedCount: items.length - completedCount,
    };

    await this.prisma.batch.updateMany({
      data: {
        config: completedConfig as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        status: toPrismaBatchStatus(BatchStatus.FAILED),
      },
      where: scopedWhere(params.organizationId, { id: params.batchId }),
    });

    await this.creditsService.settleBatchCredits({
      batchId: params.batchId,
      organizationId: params.organizationId,
      userId: params.userId,
    });

    this.logger.error(
      `Batch ${params.batchId} failed out after ${params.resumeCount} resume attempts`,
      undefined,
      {
        batchId: params.batchId,
        organizationId: params.organizationId,
        resumeCount: params.resumeCount,
      },
    );
  }
}
