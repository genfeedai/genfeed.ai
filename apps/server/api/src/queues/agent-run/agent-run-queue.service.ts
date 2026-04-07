/**
 * Agent Run Queue Service
 *
 * Manages BullMQ jobs for agent run execution:
 * - Queuing agent runs with deterministic job IDs
 * - Cancelling queued or active runs
 * - Queue statistics
 */
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface AgentRunJobData {
  /** The agent-runs record ID */
  runId: string;
  /** Organization context (required for multi-tenancy) */
  organizationId: string;
  /** User who triggered the run */
  userId: string;
  /** Strategy ID if cron-triggered */
  strategyId?: string;
  /** Agent type — drives tool subset and prompt template */
  agentType?: string;
  /** Preferred model override for this strategy */
  model?: string;
  /** Autonomy mode — supervised or auto-publish */
  autonomyMode?: string;
  /** Task/prompt for the agent */
  objective?: string;
  /** Credit budget cap */
  creditBudget?: number;
  /** Campaign ID — links the run to an agent campaign for coordination */
  campaignId?: string;
}

@Injectable()
export class AgentRunQueueService implements OnModuleInit {
  private readonly logContext = 'AgentRunQueueService';

  constructor(
    @InjectQueue('agent-run')
    @Optional()
    private readonly agentRunQueue: Queue<AgentRunJobData>,
    @Optional() private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${this.logContext} initialized`);
  }

  /**
   * Queue an agent run for execution.
   * Uses deterministic job IDs to prevent duplicate runs.
   */
  async queueRun(data: AgentRunJobData): Promise<string> {
    const url = `${this.logContext} ${CallerUtil.getCallerName()}`;
    const jobId = `agent-run-${data.runId}`;

    // Check for existing job to prevent duplicates
    const existingJob = await this.agentRunQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['active', 'waiting', 'delayed'].includes(state)) {
        this.logger.warn(
          `${url} agent run ${data.runId} already queued (${state})`,
        );
        return jobId;
      }
      await existingJob.remove();
    }

    const job = await this.agentRunQueue.add('execute-agent-run', data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${url} queued agent run`, {
      jobId: job.id,
      runId: data.runId,
      strategyId: data.strategyId,
    });

    return job.id!;
  }

  /**
   * Cancel a queued or active agent run.
   */
  async cancelRun(runId: string): Promise<boolean> {
    const jobId = `agent-run-${runId}`;
    const job = await this.agentRunQueue.getJob(jobId);

    if (!job) return false;

    const state = await job.getState();
    if (['waiting', 'delayed'].includes(state)) {
      await job.remove();
      this.logger.log(`${this.logContext} cancelled queued agent run`, {
        runId,
      });
      return true;
    }

    if (state === 'active') {
      await job.moveToFailed(new Error('Cancelled by user'), jobId);
      this.logger.log(`${this.logContext} cancelled active agent run`, {
        runId,
      });
      return true;
    }

    return false;
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const counts = await this.agentRunQueue.getJobCounts();
    return {
      active: counts.active || 0,
      completed: counts.completed || 0,
      delayed: counts.delayed || 0,
      failed: counts.failed || 0,
      waiting: counts.waiting || 0,
    };
  }
}
