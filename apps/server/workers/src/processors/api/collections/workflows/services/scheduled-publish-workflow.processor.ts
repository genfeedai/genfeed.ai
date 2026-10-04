import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SCHEDULED_PUBLISH_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';

/**
 * Concurrency 8 matches the other workflow workers. The limiter is 120 jobs
 * per minute, twice `WORKFLOW_BACKGROUND_QUEUE`'s 60: this queue carries only
 * due-post publishes, so the limiter is not protecting a shared budget, only
 * capping the burst we send to platform APIs. The sweep runs every 15 minutes,
 * so 120/min drains up to 1,800 due posts within one sweep interval, while
 * 60/min would drain 900. Both numbers are per worker process.
 */
export const SCHEDULED_PUBLISH_CONCURRENCY = 8;
export const SCHEDULED_PUBLISH_LIMITER = { duration: 60000, max: 120 };

/**
 * Dedicated worker for `dispatchClass: SCHEDULED_PUBLISH` — the 15-minute
 * scheduled-post sweep (#5890). Before this it ran on
 * `WORKFLOW_BACKGROUND_QUEUE` with ~40 unrelated producers, so a lifecycle
 * email or cron burst could consume the 60 jobs/min budget and delay due posts.
 *
 * Extends `WorkflowExecutionProcessor` to reuse its `system-run` handling
 * (retry, failure-workflow compensation, delay-resume scheduling) verbatim,
 * exactly like `BackgroundSystemWorkflowProcessor`.
 */
@Injectable()
@Processor(
  SCHEDULED_PUBLISH_QUEUE,
  withLongJobWorkerOptions({
    concurrency: SCHEDULED_PUBLISH_CONCURRENCY,
    limiter: SCHEDULED_PUBLISH_LIMITER,
  }),
)
export class ScheduledPublishWorkflowProcessor extends WorkflowExecutionProcessor {
  protected readonly logContext = 'ScheduledPublishWorkflowProcessor';

  constructor(
    logger: LoggerService,
    executorService: WorkflowExecutorService,
    queueService: WorkflowExecutionQueueService,
    schedulerService: WorkflowSchedulerService,
    systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {
    super(
      logger,
      executorService,
      queueService,
      schedulerService,
      systemWorkflowRunner,
    );
  }
}
