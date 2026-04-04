import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowExecutionJobData {
  type: 'trigger' | 'delay-resume';
  triggerEvent?: TriggerEvent;
  delayResumeData?: DelayResumeJobData;
}

// =============================================================================
// QUEUE NAME
// =============================================================================

export const WORKFLOW_EXECUTION_QUEUE = 'workflow-execution';

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
