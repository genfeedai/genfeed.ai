import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import {
  type WorkflowExecutionJobData,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SCHEDULED_PUBLISH_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import { PublishProviderGateService } from '@workers/services/publish-provider-gate.service';
import { DelayedError, type Job } from 'bullmq';

/**
 * Per-process worker concurrency: a bound on this process's own load, not on
 * any provider. Each provider's ceiling is kept in Redis by
 * `PublishProviderGateService`, so it holds across every worker process and a
 * slow provider cannot hold slots a fast one needs. It sits above the default
 * provider ceiling so one provider at its limit leaves room for others.
 *
 * There is no queue-wide limiter. BullMQ's limiter is global per queue, so one
 * number would throttle every provider to the slowest one's budget.
 */
const SCHEDULED_PUBLISH_CONCURRENCY = 24;
const UNKNOWN_PUBLISH_PROVIDER = 'unknown';

/**
 * Dedicated worker for `dispatchClass: SCHEDULED_PUBLISH`, the per-minute
 * scheduled-post sweep (#5890). Before this it ran on
 * `WORKFLOW_BACKGROUND_QUEUE` with ~40 unrelated producers, so a lifecycle
 * email or cron burst could consume the 60 jobs/min budget and delay due posts.
 *
 * Extends `WorkflowExecutionProcessor` to reuse its `system-run` handling
 * (retry, failure-workflow compensation, delay-resume scheduling) verbatim,
 * exactly like `BackgroundSystemWorkflowProcessor`.
 *
 * A job whose provider is at its ceiling goes back to delayed without using an
 * attempt, so the queue keeps publishing to other providers meanwhile.
 */
@Injectable()
@Processor(
  SCHEDULED_PUBLISH_QUEUE,
  withLongJobWorkerOptions({
    concurrency: SCHEDULED_PUBLISH_CONCURRENCY,
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
    workflowExecutions: WorkflowExecutionsService,
    private readonly providerGate: PublishProviderGateService,
  ) {
    super(
      logger,
      executorService,
      queueService,
      schedulerService,
      systemWorkflowRunner,
      workflowExecutions,
    );
  }

  async process(
    job: Job<WorkflowExecutionJobData>,
    token?: string,
  ): Promise<unknown> {
    // A job queued before providers were recorded shares the `unknown` bucket.
    const provider = job.data.publishProvider ?? UNKNOWN_PUBLISH_PROVIDER;
    const jobId = String(job.id);
    if (!token) return super.process(job);

    const decision = await this.providerGate.admit(provider, jobId);
    if (!decision.isAdmitted) {
      this.logger.log(`${this.logContext} held at provider ceiling`, {
        jobId,
        provider,
        reason: decision.reason,
        retryAfterMs: decision.retryAfterMs,
      });
      // Back to delayed without an attempt: the post stays due and the sweep's
      // deterministic job id keeps it from being queued a second time.
      await job.moveToDelayed(Date.now() + decision.retryAfterMs, token);
      throw new DelayedError();
    }

    try {
      return await super.process(job);
    } finally {
      await this.providerGate.release(provider, jobId);
    }
  }
}
