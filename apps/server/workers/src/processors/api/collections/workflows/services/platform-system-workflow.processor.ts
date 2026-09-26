import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PLATFORM_SYSTEM_WORKFLOW_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';

/**
 * Dedicated worker for platform-cron sweep dispatches
 * (`PlatformWorkflowSchedulesService`: proactive-agent-strategies,
 * analytics-sync, content-loop-autopilot) on `PLATFORM_SYSTEM_WORKFLOW_QUEUE`.
 *
 * #5162: these `system-run` jobs previously shared `WORKFLOW_EXECUTION_QUEUE`
 * with interactive agent turns. Checked against the installed bullmq@6.3.8
 * `fetchNextJob.lua`: the queue's rate limiter is checked, and blocks fetching
 * ANY job (prioritized or not), before priority is ever considered, and an
 * already-active job is never evicted from a concurrency slot for a
 * higher-priority one that arrives later. So on a shared queue, BullMQ
 * `priority` only makes a platform sweep *less likely* to starve an
 * interactive turn (by winning the next free slot once one opens) — it
 * cannot prevent a sweep burst from exhausting the rate-limit window or
 * occupying every concurrency slot with long-running work first. Giving
 * platform sweeps their own queue, with their own concurrency and limiter,
 * makes that starvation structurally impossible instead: interactive turns on
 * `WorkflowExecutionProcessor` never compete with this worker for a slot.
 *
 * Extends `WorkflowExecutionProcessor` to reuse its `system-run` handling
 * (retry, failure-workflow compensation, delay-resume scheduling) verbatim
 * instead of forking it — only the bound queue name and its concurrency/
 * limiter differ here. `queueDelayedResume` is still resolved from the
 * shared `WorkflowExecutionQueueService`, which schedules any delay-resume
 * back onto `WORKFLOW_EXECUTION_QUEUE`; none of the three platform-sweep
 * canonical workflows use a delay node today, so that path is dormant here,
 * not a starvation leak. Revisit if a future platform-swept workflow adds one.
 */
@Injectable()
@Processor(
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  withLongJobWorkerOptions({
    concurrency: 3,
    limiter: { duration: 60000, max: 30 },
  }),
)
export class PlatformSystemWorkflowProcessor extends WorkflowExecutionProcessor {
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
