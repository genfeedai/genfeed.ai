import { TurboProjectReconcileService } from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import { TurboRunReconcileService } from '@api/services/turbo-run/turbo-run-reconcile.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
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
 * Detection and the fail-out decision live in `TurboRunReconcileService`
 * on the API side; this service only re-enqueues, which keeps the API's queue
 * producer out of the reconciliation path.
 */
@Injectable()
export class CronTurboRunReconcileService {
  private readonly context = 'CronTurboRunReconcileService';

  constructor(
    private readonly logger: LoggerService,
    private readonly reconcileService: TurboRunReconcileService,
    private readonly workflowService: TurboRunWorkflowService,
    private readonly turboProjectReconcileService: TurboProjectReconcileService,
  ) {}

  /**
   * Advance Studio Batch projects whose generation is in flight (#5463), so a
   * batch the creator left mid-generation still reaches the review inbox.
   */
  async reconcileTurboProjects(): Promise<void> {
    const projectCount =
      await this.turboProjectReconcileService.reconcileGeneratingProjects();
    if (projectCount > 0) {
      this.logger.log('CronTurboRunReconcileService batch projects', {
        context: this.context,
        projectCount,
      });
    }
  }

  async reconcileSettlementShortfalls(): Promise<void> {
    await this.reconcileService.reconcileSettlementShortfalls();
  }

  async resumeStrandedTurboRuns(): Promise<void> {
    const stranded = await this.reconcileService.findStrandedTurboRuns();

    if (stranded.length === 0) {
      return;
    }

    let resumedCount = 0;

    for (const turboRun of stranded) {
      try {
        // The deterministic job id makes this a no-op when the original job is
        // still queued, so a sweep firing next to a live job cannot fork a
        // second run of the same batch.
        await this.workflowService.queueTurboRun(
          {
            turboRunId: turboRun.turboRunId,
            isResume: true,
            organizationId: turboRun.organizationId,
            userId: turboRun.userId,
          },
          SystemWorkflowDispatchClass.BACKGROUND,
        );
        resumedCount += 1;
      } catch (error: unknown) {
        // One bad batch must not stop the sweep from recovering the rest.
        this.logger.error('Failed to re-queue stranded batch', error, {
          turboRunId: turboRun.turboRunId,
          context: this.context,
        });
      }
    }

    this.logger.log('CronTurboRunReconcileService completed', {
      context: this.context,
      resumedCount,
      strandedCount: stranded.length,
    });
  }
}
