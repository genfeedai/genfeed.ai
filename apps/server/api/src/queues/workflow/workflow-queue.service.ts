/**
 * Workflow Queue Service
 *
 * Manages BullMQ jobs for workflow execution:
 * - Queuing workflow executions with retry logic
 * - Scheduling delayed jobs (for delay nodes)
 * - Resuming workflows after delay completion
 */
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

// =============================================================================
// JOB DATA TYPES
// =============================================================================

export interface WorkflowExecutionJobData {
  /** The workflow execution record ID */
  executionId: string;
  /** The workflow definition ID */
  workflowId: string;
  /** User who triggered the execution */
  userId: string;
  /** Organization context */
  organizationId: string;
  /** Input variable values */
  inputValues?: Record<string, unknown>;
  /** Trigger source */
  trigger: 'manual' | 'schedule' | 'webhook' | 'resume';
  /** If resuming, the node ID to resume from */
  resumeFromNodeId?: string;
  /** If resuming, the previous run result (serialized) */
  previousRunResult?: string;
}

export interface WorkflowDelayJobData {
  /** The workflow execution record ID */
  executionId: string;
  /** The workflow definition ID */
  workflowId: string;
  /** The delay node ID that initiated the delay */
  delayNodeId: string;
  /** User context */
  userId: string;
  /** Organization context */
  organizationId: string;
  /** When this delay was originally scheduled */
  scheduledAt: string;
  /** When the delay should complete (for validation) */
  resumeAt: string;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class WorkflowQueueService implements OnModuleInit {
  private readonly logContext = 'WorkflowQueueService';

  constructor(
    @InjectQueue('workflow-execution')
    private readonly executionQueue: Queue<WorkflowExecutionJobData>,
    @InjectQueue('workflow-delay')
    private readonly delayQueue: Queue<WorkflowDelayJobData>,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${this.logContext} initialized`);
  }

  /**
   * Queue a workflow for immediate execution.
   */
  async queueExecution(data: WorkflowExecutionJobData): Promise<string> {
    const url = `${this.logContext} ${CallerUtil.getCallerName()}`;

    const job = await this.executionQueue.add('execute-workflow', data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      jobId: `wf-exec-${data.executionId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${url} queued workflow execution`, {
      executionId: data.executionId,
      jobId: job.id,
      trigger: data.trigger,
      workflowId: data.workflowId,
    });

    return job.id!;
  }

  /**
   * Queue a workflow execution to run after a delay (for delay nodes).
   */
  async queueDelayedResume(
    data: WorkflowDelayJobData,
    delayMs: number,
  ): Promise<string> {
    const url = `${this.logContext} ${CallerUtil.getCallerName()}`;

    const job = await this.delayQueue.add('delay-resume', data, {
      attempts: 3,
      backoff: { delay: 10000, type: 'exponential' },
      delay: delayMs,
      jobId: `wf-delay-${data.executionId}-${data.delayNodeId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${url} queued delayed resume`, {
      delayMs,
      delayNodeId: data.delayNodeId,
      executionId: data.executionId,
      jobId: job.id,
      resumeAt: data.resumeAt,
      workflowId: data.workflowId,
    });

    return job.id!;
  }

  /**
   * Cancel a pending delayed resume job.
   */
  async cancelDelayedResume(
    executionId: string,
    delayNodeId: string,
  ): Promise<boolean> {
    const jobId = `wf-delay-${executionId}-${delayNodeId}`;
    const job = await this.delayQueue.getJob(jobId);

    if (job) {
      await job.remove();
      this.logger.log(`${this.logContext} cancelled delayed resume`, {
        executionId,
        jobId,
      });
      return true;
    }

    return false;
  }

  /**
   * Cancel all jobs for a workflow execution.
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execJobId = `wf-exec-${executionId}`;
    const execJob = await this.executionQueue.getJob(execJobId);
    if (execJob) {
      await execJob.remove();
    }

    // Also cancel any pending delay jobs for this execution
    const delayedJobs = await this.delayQueue.getDelayed();
    for (const job of delayedJobs) {
      if (job.data.executionId === executionId) {
        await job.remove();
      }
    }

    this.logger.log(`${this.logContext} cancelled all jobs for execution`, {
      executionId,
    });
  }

  /**
   * Get counts for workflow queues.
   */
  async getQueueStats(): Promise<{
    execution: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    };
    delay: { waiting: number; active: number; delayed: number; failed: number };
  }> {
    const [execCounts, delayCounts] = await Promise.all([
      this.executionQueue.getJobCounts(),
      this.delayQueue.getJobCounts(),
    ]);

    return {
      delay: {
        active: delayCounts.active || 0,
        delayed: delayCounts.delayed || 0,
        failed: delayCounts.failed || 0,
        waiting: delayCounts.waiting || 0,
      },
      execution: {
        active: execCounts.active || 0,
        delayed: execCounts.delayed || 0,
        failed: execCounts.failed || 0,
        waiting: execCounts.waiting || 0,
      },
    };
  }
}
