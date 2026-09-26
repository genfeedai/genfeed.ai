import { StalePendingSystemExecutionFinderService } from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * A system-workflow execution older than this, still `PENDING`, is treated
 * as never claimed rather than merely slow — see #5162.
 */
const STALE_PENDING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * A `PENDING` row older than this is left alone entirely — see
 * `StalePendingSystemExecutionFinderService.findMany` (#5252 review).
 */
const RECONCILE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const NEVER_CLAIMED_ERROR_MESSAGE =
  'This run was queued but no worker ever picked it up. Send a new message to retry.';

/**
 * Bounded-failure backstop for a stuck system-workflow run (#5162). A
 * `WorkflowExecution` normally moves out of `PENDING` within seconds; if it
 * has not after `STALE_PENDING_THRESHOLD_MS` AND its BullMQ job is gone or
 * sitting in a terminal state, no worker is ever going to pick it up — most
 * likely a pre-fix stale/terminal jobId collision (#5181), or a job that was
 * removed (`removeOnFail`/manual ops) after exhausting retries. Either way,
 * the caller (an agent thread polling for its turn to finish) must not keep
 * waiting on a run that will never move again.
 *
 * `completeExecution` is the same transition a normal in-flight failure uses
 * — it fails loudly, records proactive-run accounting, and enqueues the
 * usual workflow-outcome notification, so the client's own completion
 * recovery poll (`resolveStreamFromMessages`) observes a terminal status and
 * surfaces the error instead of scheduling another watchdog tick forever.
 */
@Injectable()
export class PendingWorkflowExecutionReconcileService {
  private readonly logContext = 'PendingWorkflowExecutionReconcileService';

  constructor(
    private readonly workflowExecutions: WorkflowExecutionsService,
    private readonly staleExecutionFinder: StalePendingSystemExecutionFinderService,
    private readonly queueService: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  async reconcile(): Promise<void> {
    const now = Date.now();
    const staleBefore = new Date(now - STALE_PENDING_THRESHOLD_MS);
    const createdAfter = new Date(now - RECONCILE_LOOKBACK_MS);
    const candidates = await this.staleExecutionFinder.findMany(
      staleBefore,
      createdAfter,
    );

    for (const candidate of candidates) {
      try {
        const hasLiveJob =
          await this.queueService.hasClaimableSystemWorkflowJob(
            `system-workflow-${candidate.id}`,
          );
        if (hasLiveJob) continue;

        await this.workflowExecutions.completeExecution(
          candidate.id,
          NEVER_CLAIMED_ERROR_MESSAGE,
        );
        this.logger.error(
          `${this.logContext} surfaced a never-claimed workflow execution`,
          {
            executionId: candidate.id,
            organizationId: candidate.organizationId,
          },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.logContext} failed to reconcile a stale pending execution`,
          {
            error,
            executionId: candidate.id,
            organizationId: candidate.organizationId,
          },
        );
      }
    }
  }
}
