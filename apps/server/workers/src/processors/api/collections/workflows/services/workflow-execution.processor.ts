import {
  WorkflowExecutionJobData,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  DelayResumeJobData,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { runWithActionOrigin } from '@api/index';
import { ActionOrigin, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

/**
 * BullMQ processor for workflow execution jobs.
 *
 * Handles:
 * - `trigger` jobs: delegates to WorkflowExecutorService.handleTriggerEvent
 * - `delay-resume` jobs: delegates to WorkflowExecutorService.resumeAfterDelay
 * - `scheduled-fire` jobs (produced by BullMQ Job Schedulers): delegates to
 *   WorkflowSchedulerService.executeScheduledWorkflow
 * - `system-run` jobs: executes one code-owned graph through the same engine
 *
 * When a workflow execution encounters a delay node, the executor returns
 * delay metadata. This processor detects it and schedules a new delayed job
 * via WorkflowExecutionQueueService.
 */
@Processor(
  WORKFLOW_EXECUTION_QUEUE,
  withLongJobWorkerOptions({
    concurrency: 5,
    limiter: { duration: 60000, max: 20 },
  }),
)
export class WorkflowExecutionProcessor extends WorkerHost {
  private readonly logContext = 'WorkflowExecutionProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly executorService: WorkflowExecutorService,
    private readonly queueService: WorkflowExecutionQueueService,
    private readonly schedulerService: WorkflowSchedulerService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {
    super();
  }

  async process(job: Job<WorkflowExecutionJobData>): Promise<unknown> {
    return runWithActionOrigin(
      job.data.actionContext ?? { origin: ActionOrigin.WORKFLOW },
      () => this.processWithActionOrigin(job),
    );
  }

  private async processWithActionOrigin(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { data } = job;

    this.logger.log(`${this.logContext} processing job`, {
      jobId: job.id,
      jobName: job.name,
      type: data.type,
    });

    try {
      switch (data.type) {
        case 'trigger':
          return await this.processTrigger(job);

        case 'delay-resume':
          return await this.processDelayResume(job);

        case 'scheduled-fire':
          return await this.processScheduledFire(job);

        case 'system-run':
          return await this.processSystemRun(job);

        default:
          throw new Error(`Unknown workflow execution job type: ${data.type}`);
      }
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} job failed`, error, {
        jobId: job.id,
        type: data.type,
      });
      throw error;
    }
  }

  private async processSystemRun(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const systemRun = job.data.systemRun;
    if (!systemRun) {
      throw new Error('System workflow job missing registered workflow input');
    }
    try {
      return await this.executeSystemRun(job, systemRun);
    } catch (error: unknown) {
      const attempts = Math.max(job.opts.attempts ?? 1, 1);
      const isTerminalAttempt = (job.attemptsMade ?? 0) + 1 >= attempts;
      if (!systemRun.failureWorkflow || !isTerminalAttempt) {
        throw error;
      }
      try {
        await this.systemWorkflowRunner.runWorkflow({
          actionType: systemRun.failureWorkflow.canonicalId,
          canonicalId: systemRun.failureWorkflow.canonicalId,
          inputValues: systemRun.failureWorkflow.inputValues,
          metadata: {
            failedCanonicalId: systemRun.input.canonicalId,
            failedJobId: job.id,
          },
          organizationId: systemRun.input.organizationId,
          source: `workflow-failure:${systemRun.input.canonicalId}`,
          userId: systemRun.input.userId,
        });
      } catch (compensationError: unknown) {
        throw new AggregateError(
          [error, compensationError],
          `System workflow ${systemRun.input.canonicalId} and registered failure workflow ${systemRun.failureWorkflow.canonicalId} both failed`,
        );
      }
      throw error;
    }
  }

  private async executeSystemRun(
    job: Job<WorkflowExecutionJobData>,
    systemRun: NonNullable<WorkflowExecutionJobData['systemRun']>,
  ): Promise<unknown> {
    const prior = systemRun.priorExecution;
    const result = prior
      ? await this.continuePriorSystemRun(systemRun, prior)
      : await this.systemWorkflowRunner.startWorkflow(systemRun.input);
    try {
      await job.updateData({
        ...job.data,
        systemRun: {
          ...systemRun,
          priorExecution: {
            ...(result.execution._delayJobData
              ? { delayResumeData: result.execution._delayJobData }
              : {}),
            executionId: result.provenance.executionId,
            status: result.execution.status,
            userId: result.userId,
            workflowId: result.provenance.workflowId,
            workflowLabel: result.provenance.workflowLabel,
          },
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.logContext} failed to persist prior system execution`,
        {
          error,
          executionId: result.provenance.executionId,
          jobId: job.id,
        },
      );
    }
    if (result.execution.status === WorkflowExecutionStatus.FAILED) {
      throw new Error(
        result.execution.error ??
          `System workflow ${systemRun.input.canonicalId} failed`,
      );
    }
    if (result.execution.status === WorkflowExecutionStatus.CANCELLED) {
      throw new Error(
        `System workflow ${systemRun.input.canonicalId} was cancelled`,
      );
    }
    if (result.execution._delayJobData) {
      await this.queueService.queueDelayedResume(
        result.execution._delayJobData,
        this.calculateDelayMs(result.execution._delayJobData),
      );
    }
    return {
      executionId: result.provenance.executionId,
      status: result.execution.status,
      workflowId: result.provenance.workflowId,
    };
  }

  private async continuePriorSystemRun(
    systemRun: NonNullable<WorkflowExecutionJobData['systemRun']>,
    prior: NonNullable<
      NonNullable<WorkflowExecutionJobData['systemRun']>['priorExecution']
    >,
  ): Promise<{
    execution: Awaited<
      ReturnType<WorkflowExecutorService['continueExistingExecution']>
    >;
    provenance: {
      executionId: string;
      workflowId: string;
      workflowLabel: string;
    };
    userId: string;
  }> {
    if (
      prior.status === WorkflowExecutionStatus.COMPLETED ||
      prior.status === WorkflowExecutionStatus.RUNNING
    ) {
      return {
        execution: {
          completedAt:
            prior.status === WorkflowExecutionStatus.COMPLETED
              ? new Date()
              : undefined,
          executionId: prior.executionId,
          nodeResults: [],
          startedAt: new Date(),
          status: prior.status,
          totalCreditsUsed: 0,
          workflowId: prior.workflowId,
          ...(prior.delayResumeData
            ? { _delayJobData: prior.delayResumeData }
            : {}),
        },
        provenance: {
          executionId: prior.executionId,
          workflowId: prior.workflowId,
          workflowLabel: prior.workflowLabel,
        },
        userId: prior.userId,
      };
    }

    const execution = await this.executorService.continueExistingExecution(
      prior.executionId,
      {
        data: systemRun.input.inputValues ?? {},
        organizationId: systemRun.input.organizationId,
        platform: 'system-workflow',
        type: 'manual',
        userId: prior.userId,
      },
    );
    return {
      execution,
      provenance: {
        executionId: prior.executionId,
        workflowId: execution.workflowId,
        workflowLabel: prior.workflowLabel,
      },
      userId: prior.userId,
    };
  }

  /**
   * Process a trigger event: find matching workflows and execute them.
   * If any execution pauses for a delay, schedule the resume job.
   */
  private async processTrigger(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { triggerEvent, priorExecutionIds } = job.data;
    if (!triggerEvent) {
      throw new Error('Trigger job missing triggerEvent data');
    }

    // BullMQ retries re-invoke this handler. Re-running handleTriggerEvent
    // would create *new* executions and re-fire every completed side-effect
    // node (publish, DM, credits). When a prior attempt recorded execution
    // ids, continue those same executionIds so durable claims + hydrated
    // nodeResults skip completed nodes (#2359).
    if (
      (job.attemptsMade ?? 0) > 0 &&
      Array.isArray(priorExecutionIds) &&
      priorExecutionIds.length > 0
    ) {
      this.logger.warn(
        `${this.logContext} continuing prior executions on job retry (no new trigger fan-out)`,
        {
          attemptsMade: job.attemptsMade,
          jobId: job.id,
          priorExecutionIds,
        },
      );

      const continued: Array<{
        executionId: string;
        status: string;
        workflowId: string;
      }> = [];
      for (const executionId of priorExecutionIds) {
        const result = await this.executorService.continueExistingExecution(
          executionId,
          triggerEvent,
        );
        continued.push(result);
      }

      for (const result of continued) {
        const delayData = (result as unknown as Record<string, unknown>)
          ._delayJobData as DelayResumeJobData | undefined;
        if (delayData) {
          const delayMs = this.calculateDelayMs(delayData);
          await this.queueService.queueDelayedResume(delayData, delayMs);
        }
      }

      return {
        continuedOnRetry: true,
        executionCount: continued.length,
        priorExecutionIds,
        results: continued.map((r) => ({
          executionId: r.executionId,
          status: r.status,
          workflowId: r.workflowId,
        })),
      };
    }

    const results = await this.executorService.handleTriggerEvent(triggerEvent);

    const executionIds = results
      .map((r) => r.executionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (executionIds.length > 0) {
      try {
        await job.updateData({
          ...job.data,
          priorExecutionIds: executionIds,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `${this.logContext} failed to persist priorExecutionIds on job`,
          { error, jobId: job.id },
        );
      }
    }

    // Check for delay pauses — schedule resume jobs
    for (const result of results) {
      // The executor attaches _delayJobData when execution pauses at a delay node
      const delayData = (result as unknown as Record<string, unknown>)
        ._delayJobData as DelayResumeJobData | undefined;

      if (delayData) {
        const delayMs = this.calculateDelayMs(delayData);
        await this.queueService.queueDelayedResume(delayData, delayMs);

        this.logger.log(
          `${this.logContext} scheduled delay resume for workflow ${delayData.workflowId}`,
          {
            delayMs,
            executionId: delayData.executionId,
          },
        );
      }
    }

    this.logger.log(`${this.logContext} trigger processed`, {
      executionCount: results.length,
      jobId: job.id,
      triggerType: triggerEvent.type,
    });

    return {
      executionCount: results.length,
      results: results.map((r) => ({
        executionId: r.executionId,
        status: r.status,
        workflowId: r.workflowId,
      })),
    };
  }

  /**
   * Process a delay resume: continue workflow execution from where it paused.
   */
  private async processDelayResume(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { delayResumeData } = job.data;
    if (!delayResumeData) {
      throw new Error('Delay resume job missing delayResumeData');
    }

    const result = await this.executorService.resumeAfterDelay(delayResumeData);

    if (result._delayJobData) {
      await this.queueService.queueDelayedResume(
        result._delayJobData,
        this.calculateDelayMs(result._delayJobData),
      );
    }

    this.logger.log(`${this.logContext} delay resume completed`, {
      executionId: result.executionId,
      jobId: job.id,
      status: result.status,
      workflowId: result.workflowId,
    });

    return {
      executionId: result.executionId,
      status: result.status,
      workflowId: result.workflowId,
    };
  }

  /**
   * Process a scheduled fire produced by a workflow's BullMQ Job Scheduler.
   * BullMQ guarantees a single delayed job per scheduler id per tick, so this
   * is the only place a workflow cron schedule executes across the fleet.
   */
  private async processScheduledFire(
    job: Job<WorkflowExecutionJobData>,
  ): Promise<unknown> {
    const { workflowId } = job.data;
    if (!workflowId) {
      throw new Error('Scheduled fire job missing workflowId data');
    }

    await this.schedulerService.executeScheduledWorkflow(workflowId);

    this.logger.log(`${this.logContext} scheduled fire processed`, {
      jobId: job.id,
      workflowId,
    });

    return { workflowId };
  }

  /**
   * Calculate delay in ms from the delay job data.
   * Reads the resumeAt from the delay node's output in the cache.
   */
  private calculateDelayMs(data: DelayResumeJobData): number {
    const cache = data.nodeOutputCache;
    const delayNodeOutput = cache[data.delayNodeId] as
      | Record<string, unknown>
      | undefined;

    if (delayNodeOutput && typeof delayNodeOutput.delayMs === 'number') {
      return Math.max(0, delayNodeOutput.delayMs);
    }

    if (delayNodeOutput && typeof delayNodeOutput.resumeAt === 'string') {
      const resumeAt = new Date(delayNodeOutput.resumeAt);
      const now = new Date();
      return Math.max(0, resumeAt.getTime() - now.getTime());
    }

    // Default: no delay (execute immediately)
    return 0;
  }
}
