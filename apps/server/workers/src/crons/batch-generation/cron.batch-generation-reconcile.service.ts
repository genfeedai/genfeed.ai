import { BatchProjectReconcileService } from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Puts stranded batches back on the queue.
 *
 * Queueing already covers the ordinary failure: a worker that dies mid-batch
 * has its job redelivered. This sweep is the backstop for the cases BullMQ
 * cannot see — a batch marked queued whose `queue.add` never landed, and a job
 * that fell out of the queue entirely. Without it those batches sit in
 * PROCESSING forever, which is the failure issue #2501 was filed for.
 *
 * Detection and the fail-out decision live in `BatchGenerationReconcileService`
 * on the API side; this service only re-enqueues, which keeps the API's queue
 * producer out of the reconciliation path.
 */
@Injectable()
export class CronBatchGenerationReconcileService {
  private readonly context = 'CronBatchGenerationReconcileService';

  constructor(
    private readonly logger: LoggerService,
    private readonly reconcileService: BatchGenerationReconcileService,
    private readonly workflowService: BatchGenerationWorkflowService,
    private readonly batchProjectReconcileService: BatchProjectReconcileService,
  ) {}

  /**
   * Advance Studio Batch projects whose generation is in flight (#5463), so a
   * batch the creator left mid-generation still reaches the review inbox.
   */
  async reconcileBatchProjects(): Promise<void> {
    const projectCount =
      await this.batchProjectReconcileService.reconcileGeneratingProjects();
    if (projectCount > 0) {
      this.logger.log('CronBatchGenerationReconcileService batch projects', {
        context: this.context,
        projectCount,
      });
    }
  }

  async reconcileSettlementShortfalls(): Promise<void> {
    await this.reconcileService.reconcileSettlementShortfalls();
  }

  async resumeStrandedBatches(): Promise<void> {
    const stranded = await this.reconcileService.findStrandedBatches();

    if (stranded.length === 0) {
      return;
    }

    let resumedCount = 0;

    for (const batch of stranded) {
      try {
        // The deterministic job id makes this a no-op when the original job is
        // still queued, so a sweep firing next to a live job cannot fork a
        // second run of the same batch.
        await this.workflowService.queueBatch(
          {
            batchId: batch.batchId,
            isResume: true,
            organizationId: batch.organizationId,
            userId: batch.userId,
          },
          SystemWorkflowDispatchClass.BACKGROUND,
        );
        resumedCount += 1;
      } catch (error: unknown) {
        // One bad batch must not stop the sweep from recovering the rest.
        this.logger.error('Failed to re-queue stranded batch', error, {
          batchId: batch.batchId,
          context: this.context,
        });
      }
    }

    this.logger.log('CronBatchGenerationReconcileService completed', {
      context: this.context,
      resumedCount,
      strandedCount: stranded.length,
    });
  }
}
