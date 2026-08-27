/**
 * Batch Generation Processor
 *
 * Runs agent-triggered batches in the workers process.
 *
 * The API used to run them as a bare in-process promise, so an API reload
 * mid-batch killed the run and left every remaining item stranded in
 * PROCESSING with no way to re-run it (issue #2501). Here the run outlives an
 * API deploy, a worker restart hands the job to another replica, and the
 * processing service's resume path picks up where the dead run stopped instead
 * of regenerating drafts that already landed.
 */
import { BatchAlreadyOwnedException } from '@server/services/batch-generation/batch-already-owned.exception';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@server/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationStreamService } from '@server/services/batch-generation/batch-generation-stream.service';
import { ActionOrigin } from '@genfeedai/enums';
import {
  BATCH_GENERATION_QUEUE,
  type BatchGenerationJobData,
} from '@genfeedai/queue-contracts';
import { runWithActionOrigin } from '@genfeedai/server';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

@Processor(BATCH_GENERATION_QUEUE, withLongJobWorkerOptions({ concurrency: 3 }))
export class BatchGenerationProcessor extends WorkerHost {
  private readonly logContext = 'BatchGenerationProcessor';

  constructor(
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => BatchGenerationService))
    private readonly batchGenerationService: BatchGenerationService,
    private readonly creditsService: BatchGenerationCreditsService,
    private readonly streamService: BatchGenerationStreamService,
  ) {
    super();
  }

  async process(job: Job<BatchGenerationJobData>): Promise<void> {
    return runWithActionOrigin(
      job.data.actionContext ?? { origin: ActionOrigin.AGENT },
      () => this.processBatchJob(job),
    );
  }

  private async processBatchJob(job: Job<BatchGenerationJobData>) {
    const { data } = job;
    const url = `${this.logContext} process`;

    const streamOptions =
      data.threadId && data.userId
        ? this.streamService.buildProcessOptions({
            batchId: data.batchId,
            runId: data.runId,
            threadId: data.threadId,
            userId: data.userId,
          })
        : undefined;

    this.logger.log(`${url} starting`, {
      batchId: data.batchId,
      isResume: data.isResume === true,
    });

    try {
      const summary = await this.batchGenerationService.processBatch(
        data.batchId,
        data.organizationId,
        streamOptions,
      );

      this.logger.log(`${url} completed`, {
        batchId: data.batchId,
        completedCount: summary.completedCount,
        failedCount: summary.failedCount,
      });
    } catch (error: unknown) {
      // A live run already owns this batch — a duplicate delivery, or a sweep
      // that raced the original job. Return without settling: the owning run
      // is still producing drafts, and settling now would price a batch that
      // is only half finished. Only the dedicated ownership error may short-
      // circuit; any other BadRequestException (validation, credits) must
      // settle what landed and rethrow so BullMQ retries or fails the job.
      if (error instanceof BatchAlreadyOwnedException) {
        this.logger.warn(`${url} batch already owned by another run`, {
          batchId: data.batchId,
        });
        return;
      }

      this.logger.error(`${url} failed`, error, { batchId: data.batchId });
      await this.settle(data);
      throw error;
    }

    await this.settle(data);
  }

  /**
   * Price the batch against what actually landed.
   *
   * Delta-based against the batch's credit ledger, so a partially completed run
   * bills only its finished drafts and a replayed job moves nothing. A settle
   * that fails must not fail the job — the reconciliation sweep settles any
   * batch this misses.
   */
  private async settle(data: BatchGenerationJobData): Promise<void> {
    try {
      await this.creditsService.settleBatchCredits({
        batchId: data.batchId,
        organizationId: data.organizationId,
        userId: data.userId,
      });
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} settlement failed`, error, {
        batchId: data.batchId,
      });
    }
  }
}
