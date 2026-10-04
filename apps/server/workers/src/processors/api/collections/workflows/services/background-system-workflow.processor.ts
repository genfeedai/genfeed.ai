import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WORKFLOW_BACKGROUND_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';

/**
 * Dedicated worker for every `dispatchClass: BACKGROUND`
 * `SystemWorkflowRunnerService.enqueueWorkflow` /
 * `WorkflowExecutionQueueService.queueSystemWorkflow` producer that is not
 * one of the three platform-cron sweep templates already isolated onto
 * `PLATFORM_SYSTEM_WORKFLOW_QUEUE` (#5162): worker crons, batch generation,
 * the clip factory, other `workflow.for-each` fan-out, RSS/social
 * ingestion, lifecycle emails, and the rest of the ~40
 * producers audited in #5271. Before this fix all of them shared
 * `WORKFLOW_EXECUTION_QUEUE` with interactive agent turns — the same
 * starvation mechanism #5162 fixed for the platform-cron sweeps, just via a
 * different set of producers.
 *
 * Extends `WorkflowExecutionProcessor` to reuse its `system-run` handling
 * (retry, failure-workflow compensation, delay-resume scheduling) verbatim
 * instead of forking it — only the bound queue name and its concurrency/
 * limiter differ here, exactly like `PlatformSystemWorkflowProcessor`.
 */
@Injectable()
@Processor(
  WORKFLOW_BACKGROUND_QUEUE,
  withLongJobWorkerOptions({
    concurrency: 8,
    limiter: { duration: 60000, max: 60 },
  }),
)
export class BackgroundSystemWorkflowProcessor extends WorkflowExecutionProcessor {
  // Shadows the base class's `protected logContext` field so log lines from
  // jobs processed by this worker are attributable to it, not to
  // `WorkflowExecutionProcessor` — see the matching comment on
  // `PlatformSystemWorkflowProcessor` (#5252 review).
  protected readonly logContext = 'BackgroundSystemWorkflowProcessor';

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
