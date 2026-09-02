import {
  DEFAULT_QUEUE,
  QueueDegradationReason,
  type QueueDispatchResult,
  QueueDispatchStatus,
} from '@genfeedai/contracts/queue';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { isInProcessRedis } from '@libs/redis/redis-driver';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';

export interface QueueJob<T = Record<string, unknown>> {
  id?: string;
  data: T;
  options?: JobsOptions;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(DEFAULT_QUEUE) private readonly defaultQueue: Queue,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async add<T = Record<string, unknown>>(
    queueName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return queue.add(queueName, data, options);
  }

  /**
   * Enqueue work and report the outcome as data rather than as an exception
   * (#2382).
   *
   * {@link add} rejects when no broker is reachable, which a controller can only
   * surface as a 500. `dispatch` distinguishes "the broker is down" from "this
   * deployment has no broker by design" (offline desktop, epic #2378) and
   * returns a {@link QueueDispatchResult} either way, so the caller can choose a
   * fallback instead of failing the request.
   *
   * `add()` is deliberately left unchanged: cloud and community callers keep
   * their current throwing contract until each is migrated deliberately.
   */
  async dispatch<T = Record<string, unknown>>(
    queueName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<QueueDispatchResult> {
    if (isInProcessRedis(this.configService)) {
      return {
        detail: `REDIS_DRIVER=in-process: no queue worker exists in this deployment, so "${queueName}" was not enqueued.`,
        queueName,
        reason: QueueDegradationReason.NO_BROKER_CONFIGURED,
        status: QueueDispatchStatus.DEGRADED,
      };
    }

    try {
      const job = await this.add(queueName, data, options);
      return {
        jobId: String(job.id),
        queueName,
        status: QueueDispatchStatus.ENQUEUED,
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `QueueService.dispatch: "${queueName}" could not be enqueued — degrading`,
        error,
      );
      return {
        detail: (error as Error).message,
        queueName,
        reason: QueueDegradationReason.BROKER_UNREACHABLE,
        status: QueueDispatchStatus.DEGRADED,
      };
    }
  }

  private getQueue(queueName: string): Queue {
    if (queueName !== DEFAULT_QUEUE) {
      throw new Error(`Unsupported queue: ${queueName}`);
    }
    return this.defaultQueue;
  }

  getJob<T = Record<string, unknown>>(
    jobId: string,
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T> | undefined> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId) as Promise<Job<T> | undefined>;
  }

  getJobs<T = Record<string, unknown>>(
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start?: number,
    end?: number,
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getJobs([status], start, end) as Promise<Job<T>[]>;
  }

  clean(
    grace: number,
    status: 'completed' | 'failed',
    queueName: string = DEFAULT_QUEUE,
  ): Promise<string[]> {
    const queue = this.getQueue(queueName);
    // BullMQ clean method returns array of removed job IDs
    return queue.clean(grace, 0, status);
  }

  async pause(queueName: string = DEFAULT_QUEUE): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  async resume(queueName: string = DEFAULT_QUEUE): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  isPaused(queueName: string = DEFAULT_QUEUE): Promise<boolean> {
    const queue = this.getQueue(queueName);
    return queue.isPaused();
  }

  getWaiting<T = Record<string, unknown>>(
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getWaiting() as Promise<Job<T>[]>;
  }

  getActive<T = Record<string, unknown>>(
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getActive() as Promise<Job<T>[]>;
  }

  getCompleted<T = Record<string, unknown>>(
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getCompleted() as Promise<Job<T>[]>;
  }

  getFailed<T = Record<string, unknown>>(
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getFailed() as Promise<Job<T>[]>;
  }

  getDelayed<T = Record<string, unknown>>(
    queueName: string = DEFAULT_QUEUE,
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getDelayed() as Promise<Job<T>[]>;
  }

  async getCounts(queueName: string = DEFAULT_QUEUE): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts();
    return {
      active: counts.active || 0,
      completed: counts.completed || 0,
      delayed: counts.delayed || 0,
      failed: counts.failed || 0,
      paused: counts.paused || 0,
      waiting: counts.waiting || 0,
    };
  }
}
