import { createHash } from 'node:crypto';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { isProtectedSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import type { RunSystemWorkflowInput } from '@api/collections/workflows/system-workflow-definition';
import {
  getActionOriginContext,
  sanitizeActionOriginContext,
} from '@api/index';
import { reserveIdempotentJob } from '@api/queues/idempotent-job';
import {
  ActionOrigin,
  type ActionOriginContext,
  type WorkflowExecutionStatus,
  WorkflowStatus,
} from '@genfeedai/contracts';
import type { WorkflowTriggerQueueOptions } from '@genfeedai/contracts/interfaces';
import {
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowExecutionJobData {
  actionContext?: ActionOriginContext;
  type: 'trigger' | 'delay-resume' | 'scheduled-fire' | 'system-run';
  triggerEvent?: TriggerEvent;
  delayResumeData?: DelayResumeJobData;
  workflowId?: string;
  /**
   * Execution ids created on the first trigger attempt. BullMQ job retries
   * must not spawn a second full run (that re-fires completed side-effect
   * nodes — #2359). On retry the processor short-circuits when these are
   * already terminal, or continues from their persisted nodeResults.
   */
  priorExecutionIds?: string[];
  systemRun?: {
    failureWorkflow?: SystemWorkflowFailureReference;
    input: Omit<RunSystemWorkflowInput, 'runtimeContext'>;
    priorExecution?: {
      delayResumeData?: DelayResumeJobData;
      executionId: string;
      status: WorkflowExecutionStatus;
      userId: string;
      workflowId: string;
      workflowLabel: string;
    };
  };
}

export interface SystemWorkflowFailureReference {
  canonicalId: string;
  inputValues?: Record<string, unknown>;
}

export interface QueueSystemWorkflowOptions {
  attempts?: number;
  delayMs?: number;
  failureWorkflow?: SystemWorkflowFailureReference;
  priorExecution?: NonNullable<
    NonNullable<WorkflowExecutionJobData['systemRun']>['priorExecution']
  >;
  /**
   * Route this job to `PLATFORM_SYSTEM_WORKFLOW_QUEUE` instead of
   * `WORKFLOW_EXECUTION_QUEUE`. Set for platform-cron sweep dispatches
   * (`PlatformWorkflowSchedulesService`), proactive agent-strategy turns, and
   * `workflow.for-each` children spawned from a platform-sweep workflow —
   * see #5162.
   *
   * BullMQ `priority` was considered and dropped (#5252 review): its rate
   * limiter is checked before priority is ever consulted, and an
   * already-active job is never evicted from a concurrency slot for a
   * higher-priority one that arrives later — so priority on a shared queue
   * only makes starvation *less likely*, and only for the producers that set
   * it. This queue was the one shared by ~40 unprioritized producers (worker
   * crons, batch generation, the clip factory, `workflow.for-each` fan-out);
   * `fetchNextJob.lua` pops the plain wait list before the `prioritized` set,
   * so giving only agent turns a priority would have made every one of those
   * other producers run *ahead* of them — the opposite of the intent. A
   * dedicated queue is the only fix that is correct for every producer
   * without auditing and annotating all of them.
   */
  usePlatformQueue?: boolean;
  /**
   * @deprecated `queueSystemWorkflow` now always reserves a fresh id (removing
   * a stale/terminal job under the same deterministic jobId before adding) —
   * see #5162. Every call site already set this to `true`; it is kept as a
   * no-op so existing callers don't need a mechanical edit, but new callers
   * don't need to set it.
   */
  replaceTerminalJob?: boolean;
}

export interface WorkflowSchedulerUpsertInput {
  workflowId: string;
  cronExpression: string;
  timezone: string;
}

/**
 * Minimal workflow-row shape needed to decide whether its BullMQ job
 * scheduler should exist (upsert) or not (remove).
 */
export interface WorkflowSchedulerSyncRow {
  id: string;
  schedule?: string | null;
  timezone?: string | null;
  isScheduleEnabled?: boolean | null;
  isDeleted?: boolean | null;
  metadata?: unknown;
  status?: string | null;
}

// =============================================================================
// SCHEDULER ID
// =============================================================================

/**
 * BullMQ Job Scheduler id for a workflow's cron schedule. One scheduler per
 * workflow: upserting the same id from any number of API replicas is
 * idempotent, so BullMQ guarantees exactly one delayed fire per tick.
 *
 * Keep the colon form shipped since #1109. Job Scheduler ids are not
 * validated like Job.add custom ids, and renaming forks a second
 * production scheduler for every enabled workflow.
 */
export function workflowSchedulerId(workflowId: string): string {
  return `workflow-schedule:${workflowId}`;
}

/**
 * States a freshly enqueued `system-run` job may legitimately be in right
 * after `add()` returns: still waiting for a worker, scheduled for a delayed
 * retry, already picked up by a worker within this same call, or — for a job
 * added with `priority > 0` — sitting in BullMQ's separate `prioritized` ZSET
 * (`getState` reads that set before the plain wait list; see
 * includes/getState.lua in the installed bullmq package). Anything else
 * (most importantly `completed`/`failed`) means `add()` silently handed back
 * a stale job instead of creating new work — see #5162.
 *
 * Also used by `hasClaimableSystemWorkflowJob` to answer the same question
 * later, for a `WorkflowExecution` that has been sitting `PENDING` — see
 * `PendingWorkflowExecutionReconcileService`.
 */
export const CLAIMABLE_JOB_STATES = new Set<string>([
  'waiting',
  'delayed',
  'active',
  'prioritized',
]);

function requireQueueJobId(
  jobId: string | undefined,
  operation: string,
): string {
  if (!jobId) {
    throw new Error(`BullMQ did not return a job id while ${operation}`);
  }
  return jobId;
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Queue service for workflow execution jobs.
 *
 * Handles workflow entry jobs:
 * 1. `trigger` — Execute workflows in response to a trigger event
 * 2. `delay-resume` — Resume a paused workflow after a delay
 * 3. `scheduled-fire` — Execute one persisted scheduled workflow
 * 4. `system-run` — Resolve and execute one registered code-owned graph
 */
@Injectable()
export class WorkflowExecutionQueueService {
  private readonly logContext = 'WorkflowExecutionQueueService';

  constructor(
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
    // Platform-cron sweep dispatches only — see `usePlatformQueue` on
    // `QueueSystemWorkflowOptions` and #5162.
    @InjectQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
    private readonly platformSystemWorkflowQueue: Queue<WorkflowExecutionJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Queue a trigger event for processing.
   * The processor will find matching workflows and execute them.
   */
  async queueTriggerEvent(
    event: TriggerEvent,
    options: WorkflowTriggerQueueOptions = {},
  ): Promise<string> {
    const job = await this.executionQueue.add(
      'trigger',
      {
        actionContext: sanitizeActionOriginContext(getActionOriginContext()),
        triggerEvent: event,
        type: 'trigger',
      },
      {
        attempts: 1, // Triggers should not auto-retry at queue level
        ...(options.jobId ? { jobId: options.jobId } : {}),
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );

    this.logger.log(`${this.logContext} queued trigger event`, {
      jobId: job.id,
      organizationId: event.organizationId,
      triggerType: event.type,
    });

    return requireQueueJobId(job.id, 'queueing a workflow trigger');
  }

  async queueSystemWorkflow(
    input: Omit<RunSystemWorkflowInput, 'runtimeContext'>,
    jobId: string,
    options: QueueSystemWorkflowOptions = {},
  ): Promise<string> {
    // BullMQ's `add(name, data, { jobId })` silently no-ops when a job with
    // that id already exists in Redis, in ANY state — waiting/active/delayed
    // AND terminal completed/failed. It returns the existing job without
    // enqueueing new work and without throwing (#5162). `execution.id` (the
    // source of this jobId, `system-workflow-${execution.id}`) can be reused
    // across calls through WorkflowExecutionsService.createExecution's
    // idempotency-key upsert: a retried acceptance call with the same
    // idempotencyKey resolves to the SAME execution row, and therefore the
    // SAME jobId. If a prior BullMQ job under that id is still sitting in
    // Redis, the caller here previously got a false "queued" success while no
    // worker would ever pick the job up — the run stayed stuck with no error.
    // Always reserve the id first so a stale/terminal job is removed and a
    // fresh one can be added; an in-flight job under the same id is left
    // alone and reported back rather than silently swallowed.
    //
    // Platform-cron sweep dispatches (`usePlatformQueue`) reserve and add on
    // `PLATFORM_SYSTEM_WORKFLOW_QUEUE` instead of the shared
    // `WORKFLOW_EXECUTION_QUEUE` — see #5162 and `QueueSystemWorkflowOptions`.
    const targetQueue = options.usePlatformQueue
      ? this.platformSystemWorkflowQueue
      : this.executionQueue;
    const reservation = await reserveIdempotentJob(targetQueue, jobId);
    if (reservation.alreadyQueued) {
      this.logger.log(`${this.logContext} system workflow already queued`, {
        canonicalId: input.canonicalId,
        jobId,
        organizationId: input.organizationId,
        state: reservation.state,
      });
      return jobId;
    }
    const job = await targetQueue.add(
      'system-run',
      {
        actionContext: sanitizeActionOriginContext(getActionOriginContext()),
        systemRun: {
          ...(options.failureWorkflow
            ? { failureWorkflow: options.failureWorkflow }
            : {}),
          input,
          ...(options.priorExecution
            ? { priorExecution: options.priorExecution }
            : {}),
        },
        type: 'system-run',
      },
      {
        attempts: options.attempts ?? 3,
        backoff: { delay: 5000, type: 'exponential' },
        ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
        jobId,
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );
    const queuedJobId = requireQueueJobId(job.id, 'queueing a system workflow');

    // Fail loudly instead of silently: the reservation above should have
    // guaranteed a fresh add, so the resulting job must be claimable
    // (waiting/delayed, or already active if a worker grabbed it within this
    // same call). Any other state means `add` still silently reused an
    // existing job and this run will never be picked up — surface that
    // immediately rather than letting the caller log a false "queued" success.
    const resultingState = await job.getState().catch((error: unknown) => {
      this.logger.warn(
        `${this.logContext} could not verify system workflow job state after enqueue`,
        { canonicalId: input.canonicalId, error, jobId: queuedJobId },
      );
      return undefined;
    });
    if (resultingState && !CLAIMABLE_JOB_STATES.has(resultingState)) {
      this.logger.error(
        `${this.logContext} system workflow job was not queued for pickup after enqueue — a worker will never claim it`,
        {
          canonicalId: input.canonicalId,
          jobId: queuedJobId,
          organizationId: input.organizationId,
          resultingState,
        },
      );
      throw new Error(
        `System workflow ${input.canonicalId} job ${queuedJobId} landed in unclaimable state "${resultingState}" after enqueue`,
      );
    }

    this.logger.log(`${this.logContext} queued system workflow`, {
      canonicalId: input.canonicalId,
      jobId: queuedJobId,
      organizationId: input.organizationId,
    });

    return queuedJobId;
  }

  /**
   * Queue a delayed resume job.
   * The processor will resume workflow execution after the delay.
   */
  async queueDelayedResume(
    data: DelayResumeJobData,
    delayMs: number,
  ): Promise<string> {
    const identity = createHash('sha256')
      .update(`${data.executionId}:${data.delayNodeId}`)
      .digest('hex')
      .slice(0, 32);
    const job = await this.executionQueue.add(
      'delay-resume',
      {
        actionContext: sanitizeActionOriginContext(getActionOriginContext()),
        delayResumeData: data,
        type: 'delay-resume',
      },
      {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        delay: delayMs,
        jobId: `workflow-delay-${identity}`,
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );

    this.logger.log(`${this.logContext} queued delay resume`, {
      delayMs,
      executionId: data.executionId,
      jobId: job.id,
      workflowId: data.workflowId,
    });

    return requireQueueJobId(job.id, 'queueing a delayed workflow resume');
  }

  /**
   * Upsert the BullMQ Job Scheduler that fires a workflow's cron schedule.
   * Replica-safe: BullMQ keys the scheduler on its id, so concurrent upserts
   * from multiple producers converge on a single scheduler and one delayed job.
   */
  async upsertWorkflowScheduler(
    input: WorkflowSchedulerUpsertInput,
  ): Promise<void> {
    await this.executionQueue.upsertJobScheduler(
      workflowSchedulerId(input.workflowId),
      {
        pattern: input.cronExpression,
        tz: input.timezone,
      },
      {
        data: {
          actionContext: { origin: ActionOrigin.WORKFLOW },
          type: 'scheduled-fire',
          workflowId: input.workflowId,
        },
        name: 'scheduled-fire',
        opts: {
          attempts: 1, // Scheduled fires must not auto-retry (next tick covers it)
          removeOnComplete: 200,
          removeOnFail: 100,
        },
      },
    );

    this.logger.log(`${this.logContext} upserted workflow scheduler`, {
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      workflowId: input.workflowId,
    });
  }

  /**
   * Remove the BullMQ Job Scheduler for a workflow. Idempotent.
   */
  async removeWorkflowScheduler(workflowId: string): Promise<void> {
    await this.executionQueue.removeJobScheduler(
      workflowSchedulerId(workflowId),
    );

    this.logger.log(`${this.logContext} removed workflow scheduler`, {
      workflowId,
    });
  }

  /**
   * Upsert or remove the job scheduler for one workflow row based on its
   * current schedule/enabled/status state. Never throws — scheduler sync is
   * best-effort and must not fail the surrounding write path.
   */
  async syncWorkflowScheduler(
    workflow: WorkflowSchedulerSyncRow,
  ): Promise<void> {
    const workflowId = workflow.id;

    try {
      if (isProtectedSystemWorkflowMetadata(workflow.metadata)) {
        await this.removeWorkflowScheduler(workflowId);
        return;
      }

      const isSchedulable =
        !workflow.isDeleted &&
        Boolean(workflow.schedule) &&
        workflow.isScheduleEnabled === true &&
        workflow.status === WorkflowStatus.ACTIVE;

      if (isSchedulable) {
        await this.upsertWorkflowScheduler({
          cronExpression: workflow.schedule as string,
          timezone: workflow.timezone || 'UTC',
          workflowId,
        });
      } else {
        await this.removeWorkflowScheduler(workflowId);
      }
    } catch (error) {
      this.logger.error(
        `${this.logContext} failed to sync workflow scheduler`,
        {
          error,
          workflowId,
        },
      );
    }
  }

  /**
   * Get pending jobs for a workflow.
   */
  async getPendingJobs(
    workflowId: string,
  ): Promise<Array<{ id: string; type: string; delay?: number }>> {
    const jobs = await this.executionQueue.getJobs([
      'waiting',
      'delayed',
      'active',
    ]);

    return jobs
      .filter((job) => {
        const data = job.data;
        if (data.type === 'trigger') {
          return false; // Triggers are org-wide, not workflow-specific
        }
        return data.delayResumeData?.workflowId === workflowId;
      })
      .flatMap((job) =>
        job.id ? [{ delay: job.delay, id: job.id, type: job.data.type }] : [],
      );
  }

  /**
   * Whether `jobId` (the deterministic `system-workflow-${executionId}` id a
   * `system-run` job is queued under) is still claimable by a worker on
   * either queue a system workflow may have been routed to. Used by
   * `PendingWorkflowExecutionReconcileService` (#5162) to tell a merely slow
   * run from one that was queued but will never be picked up — no job at
   * all, or one sitting in a terminal `completed`/`failed` state while its
   * `WorkflowExecution` row is still `PENDING`.
   */
  async hasClaimableSystemWorkflowJob(jobId: string): Promise<boolean> {
    for (const queue of [
      this.executionQueue,
      this.platformSystemWorkflowQueue,
    ]) {
      const job = await queue.getJob(jobId);
      if (!job) continue;
      const state = await job.getState();
      if (CLAIMABLE_JOB_STATES.has(state)) {
        return true;
      }
    }
    return false;
  }
}
