/**
 * Batch Generation Queue Service
 *
 * Hands agent-triggered batches to the workers process instead of running them
 * as an in-process promise in the API. The old shape died with the API: a
 * reload mid-batch left every item stranded in PROCESSING with nothing alive to
 * finish them and no way to re-run. A queued job survives the restart — BullMQ
 * redelivers it — and the batch's own row records that it was handed over, so
 * the reconciliation sweep can recover an enqueue that never landed.
 */
import type { BatchConfig } from '@api/services/batch-generation/batch-generation.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import {
  BATCH_GENERATION_QUEUE,
  type BatchGenerationJobData,
} from '@genfeedai/queue-contracts';
import {
  reserveIdempotentJob,
  resolveNestedActionOrigin,
  sanitizeActionOriginContext,
  scopedWhere,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

/** One job per batch, so a redelivery or a resume never forks a second run. */
export function batchGenerationJobId(batchId: string): string {
  return `batch-generation-${batchId}`;
}

@Injectable()
export class BatchGenerationQueueService {
  private readonly logContext = 'BatchGenerationQueueService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @InjectQueue(BATCH_GENERATION_QUEUE)
    @Optional()
    private readonly batchGenerationQueue?: Queue<BatchGenerationJobData>,
  ) {}

  /**
   * Queue a batch for processing.
   *
   * `config.queuedAt` is stamped **before** `queue.add`, so a crash between the
   * two leaves evidence: the sweep sees a PENDING batch that claims to have
   * been queued and re-enqueues it. Stamping afterwards would lose that batch
   * silently, which is the bug this whole change exists to remove.
   */
  async queueBatch(data: BatchGenerationJobData): Promise<string | null> {
    const url = `${this.logContext} ${CallerUtil.getCallerName()}`;

    if (!this.batchGenerationQueue) {
      this.logger.warn(`${url} batch queue unavailable`, {
        batchId: data.batchId,
      });
      return null;
    }

    const jobId = batchGenerationJobId(data.batchId);
    const payload: BatchGenerationJobData = {
      ...data,
      actionContext: sanitizeActionOriginContext(
        data.actionContext ?? resolveNestedActionOrigin(ActionOrigin.AGENT),
      ),
    };

    const reservation = await reserveIdempotentJob(
      this.batchGenerationQueue,
      jobId,
    );
    if (reservation.alreadyQueued) {
      this.logger.warn(
        `${url} batch ${data.batchId} already queued (${reservation.state})`,
      );
      return jobId;
    }

    await this.markBatchQueued(data.batchId, data.organizationId);

    const job = await this.batchGenerationQueue.add('process-batch', payload, {
      // One attempt: the processor is the retry boundary. A batch that dies
      // mid-run is re-claimed by the resume path, which skips items already
      // persisted — replaying the whole job instead would regenerate them.
      attempts: 1,
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${url} queued batch generation`, {
      batchId: data.batchId,
      isResume: data.isResume === true,
      jobId: job.id,
    });

    return job.id ?? jobId;
  }

  /** Record the hand-off on the batch row so the sweep can see it. */
  private async markBatchQueued(
    batchId: string,
    organizationId: string,
  ): Promise<void> {
    const batch = await this.prisma.batch.findFirst({
      select: { config: true },
      where: scopedWhere(organizationId, { id: batchId }),
    });

    if (!batch) {
      return;
    }

    const config = (batch.config ?? {}) as BatchConfig;

    // Name the shape before the cast. An inline literal widens the optional
    // nested config objects, and the stricter tsconfigs then reject the direct
    // `as Prisma.InputJsonValue` conversion as non-overlapping.
    const queuedConfig: BatchConfig = {
      ...config,
      queuedAt: new Date().toISOString(),
    };

    await this.prisma.batch.updateMany({
      data: {
        config: queuedConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(organizationId, { id: batchId }),
    });
  }
}
