import {
  JOB_PRIORITY,
  type JobConfig,
  type JobPriority,
  type JobType,
} from '@files/queues/queue.constants';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

/**
 * Default job configuration
 */
export const DEFAULT_JOB_CONFIG: JobConfig = {
  attempts: 3,
  defaultPriority: JOB_PRIORITY.NORMAL,
  delay: 2000,
};

/**
 * Base interface for all job data types
 */
export interface BaseJobDataWithPriority {
  priority?: JobPriority;
}

/**
 * BaseQueueService - Abstract base class for queue services
 *
 * Provides common queue operations:
 * - addJob() with config lookup
 * - getJob(), getJobCounts(), clean() methods
 * - Logger initialization
 *
 * @example
 * export class FileQueueService extends BaseQueueService<FileJobData> {
 *   protected readonly jobConfigs: Partial<Record<JobType, JobConfig>> = {
 *     [JOB_TYPES.DOWNLOAD_FILE]: { attempts: 5, delay: 1000, defaultPriority: JOB_PRIORITY.HIGH },
 *   };
 *
 *   constructor(@InjectQueue(QUEUE_NAMES.FILE_PROCESSING) queue: Queue<FileJobData>) {
 *     super(queue, FileQueueService.name);
 *   }
 *
 *   async addDownloadJob(data: FileJobData) {
 *     return this.addJob(JOB_TYPES.DOWNLOAD_FILE, data, 'download', data.params?.url);
 *   }
 * }
 */
export abstract class BaseQueueService<T extends BaseJobDataWithPriority> {
  protected readonly logger: Logger;

  /**
   * Job type specific configurations. Override in subclass.
   */
  protected readonly jobConfigs: Partial<Record<JobType, JobConfig>> = {};

  constructor(
    protected readonly queue: Queue<T>,
    loggerContext: string,
  ) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Add a job to the queue with standardized configuration
   *
   * @param jobType - The job type constant
   * @param data - Job data
   * @param logLabel - Label for logging (e.g., 'download', 'resize')
   * @param logExtra - Optional extra info for logging (defaults to ingredient ID)
   * @returns The created job
   */
  protected async addJob(
    jobType: JobType,
    data: T,
    logLabel: string,
    logExtra?: string,
  ): Promise<Job<T>> {
    const config = this.jobConfigs[jobType] || DEFAULT_JOB_CONFIG;
    type QueueAdd = Queue<T>['add'];

    const job = await this.queue.add(
      jobType as Parameters<QueueAdd>[0],
      data as Parameters<QueueAdd>[1],
      {
        attempts: config.attempts,
        backoff: { delay: config.delay, type: 'exponential' },
        priority: data.priority || config.defaultPriority,
      } as Parameters<QueueAdd>[2],
    );

    const ingredientId = (data as Record<string, unknown>).ingredientId;
    const extra = logExtra || `ingredient ${ingredientId}`;
    this.logger.log(`Added ${logLabel} job ${job.id} for ${extra}`);

    return job as Job<T>;
  }

  /**
   * Add a job with custom delay
   *
   * @param jobType - The job type constant
   * @param data - Job data
   * @param delayMs - Delay in milliseconds before job runs
   * @param logLabel - Label for logging
   * @param logExtra - Optional extra info for logging
   * @returns The created job
   */
  protected async addJobWithDelay(
    jobType: JobType,
    data: T,
    delayMs: number,
    logLabel: string,
    logExtra?: string,
  ): Promise<Job<T>> {
    const config = this.jobConfigs[jobType] || DEFAULT_JOB_CONFIG;
    type QueueAdd = Queue<T>['add'];

    const job = await this.queue.add(
      jobType as Parameters<QueueAdd>[0],
      data as Parameters<QueueAdd>[1],
      {
        attempts: config.attempts,
        backoff: { delay: config.delay, type: 'exponential' },
        delay: delayMs,
        priority: data.priority || config.defaultPriority,
      } as Parameters<QueueAdd>[2],
    );

    const ingredientId = (data as Record<string, unknown>).ingredientId;
    const extra = logExtra || `ingredient ${ingredientId}`;
    this.logger.log(`Added ${logLabel} job ${job.id} for ${extra}`);

    return job as Job<T>;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job<T> | undefined> {
    const job = await this.queue.getJob(jobId);
    return job as Job<T> | undefined;
  }

  /**
   * Get job counts by status
   */
  getJobCounts() {
    return this.queue.getJobCounts();
  }

  /**
   * Clean old jobs from the queue
   *
   * @param grace - Grace period in milliseconds (default: 1 hour)
   */
  async clean(grace: number = 3600000): Promise<void> {
    await this.queue.clean(grace, 0, 'completed');
    await this.queue.clean(grace * 2, 0, 'failed');
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Queue resumed');
  }
}
