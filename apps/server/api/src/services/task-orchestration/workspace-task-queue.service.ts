import {
  WORKSPACE_TASK_QUEUE,
  WorkspaceTaskJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class WorkspaceTaskQueueService {
  private readonly logContext = 'WorkspaceTaskQueueService';

  constructor(
    @InjectQueue(WORKSPACE_TASK_QUEUE)
    private readonly queue: Queue<WorkspaceTaskJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Enqueue a workspace task for orchestration.
   * Uses deterministic job IDs to prevent duplicate processing.
   */
  async enqueue(data: WorkspaceTaskJobData): Promise<string> {
    const jobId = `workspace-task-${data.taskId}`;

    // Prevent duplicate jobs
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (['active', 'waiting', 'delayed'].includes(state)) {
        this.logger.warn(
          `${this.logContext}: Task ${data.taskId} already queued (${state})`,
        );
        return jobId;
      }
      await existing.remove();
    }

    const job = await this.queue.add('orchestrate-task', data, {
      attempts: 2,
      backoff: { delay: 5000, type: 'exponential' },
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${this.logContext}: Enqueued task ${data.taskId}`, {
      jobId: job.id,
      taskId: data.taskId,
    });

    return job.id!;
  }
}
