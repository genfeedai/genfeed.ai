import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowExecutionJobData {
  type: 'trigger' | 'delay-resume' | 'scheduled-fire';
  triggerEvent?: TriggerEvent;
  delayResumeData?: DelayResumeJobData;
  workflowId?: string;
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
  id?: string;
  _id?: unknown;
  schedule?: string | null;
  timezone?: string | null;
  isScheduleEnabled?: boolean | null;
  isDeleted?: boolean | null;
  status?: string | null;
}

// =============================================================================
// SCHEDULER ID
// =============================================================================

/**
 * BullMQ Job Scheduler id for a workflow's cron schedule. One scheduler per
 * workflow: upserting the same id from any number of API replicas is
 * idempotent, so BullMQ guarantees exactly one delayed fire per tick.
 */
export function workflowSchedulerId(workflowId: string): string {
  return `workflow-schedule:${workflowId}`;
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Queue service for workflow execution jobs.
 *
 * Handles two job types:
 * 1. `trigger` — Execute workflows in response to a trigger event
 * 2. `delay-resume` — Resume a paused workflow after a delay
 */
@Injectable()
export class WorkflowExecutionQueueService {
  private readonly logContext = 'WorkflowExecutionQueueService';

  constructor(
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Queue a trigger event for processing.
   * The processor will find matching workflows and execute them.
   */
  async queueTriggerEvent(event: TriggerEvent): Promise<string> {
    const job = await this.executionQueue.add(
      'trigger',
      {
        triggerEvent: event,
        type: 'trigger',
      },
      {
        attempts: 1, // Triggers should not auto-retry at queue level
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );

    this.logger.log(`${this.logContext} queued trigger event`, {
      jobId: job.id,
      organizationId: event.organizationId,
      triggerType: event.type,
    });

    return job.id!;
  }

  /**
   * Queue a delayed resume job.
   * The processor will resume workflow execution after the delay.
   */
  async queueDelayedResume(
    data: DelayResumeJobData,
    delayMs: number,
  ): Promise<string> {
    const job = await this.executionQueue.add(
      'delay-resume',
      {
        delayResumeData: data,
        type: 'delay-resume',
      },
      {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        delay: delayMs,
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

    return job.id!;
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
    const workflowId = String(workflow.id ?? workflow._id ?? '');
    if (!workflowId) {
      return;
    }

    const isSchedulable =
      !workflow.isDeleted &&
      Boolean(workflow.schedule) &&
      workflow.isScheduleEnabled === true &&
      workflow.status === WorkflowStatus.ACTIVE;

    try {
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
      .map((job) => ({
        delay: job.delay,
        id: job.id!,
        type: job.data.type,
      }));
  }
}
