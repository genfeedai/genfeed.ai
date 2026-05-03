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
    @InjectQueue('default') private readonly defaultQueue: Queue,
    @InjectQueue('analytics-twitter')
    private readonly analyticsTwitterQueue: Queue,
    @InjectQueue('analytics-youtube')
    private readonly analyticsYouTubeQueue: Queue,
    @InjectQueue('analytics-social')
    private readonly analyticsSocialQueue: Queue,
    @InjectQueue('ad-sync-meta')
    private readonly adSyncMetaQueue: Queue,
    @InjectQueue('ad-sync-google')
    private readonly adSyncGoogleQueue: Queue,
    @InjectQueue('ad-sync-tiktok')
    private readonly adSyncTikTokQueue: Queue,
    @InjectQueue('ad-insights-aggregation')
    private readonly adInsightsAggregationQueue: Queue,
    @InjectQueue('analytics-sync')
    private readonly analyticsSyncQueue: Queue,
    @InjectQueue('email-digest')
    private readonly emailDigestQueue: Queue,
    @InjectQueue('ad-bulk-upload')
    private readonly adBulkUploadQueue: Queue,
    @InjectQueue('ad-optimization')
    private readonly adOptimizationQueue: Queue,
    @InjectQueue('telegram-distribute')
    private readonly telegramDistributeQueue: Queue,
    @InjectQueue('analytics-facebook')
    private readonly analyticsFacebookQueue: Queue,
    @InjectQueue('analytics-threads')
    private readonly analyticsThreadsQueue: Queue,
  ) {}

  add<T = Record<string, unknown>>(
    queueName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return queue.add(queueName, data, options);
  }

  private getQueue(queueName: string): Queue {
    switch (queueName) {
      case 'analytics-twitter':
        return this.analyticsTwitterQueue;
      case 'analytics-youtube':
        return this.analyticsYouTubeQueue;
      case 'analytics-social':
        return this.analyticsSocialQueue;
      case 'ad-sync-meta':
        return this.adSyncMetaQueue;
      case 'ad-sync-google':
        return this.adSyncGoogleQueue;
      case 'ad-sync-tiktok':
        return this.adSyncTikTokQueue;
      case 'ad-insights-aggregation':
        return this.adInsightsAggregationQueue;
      case 'analytics-sync':
        return this.analyticsSyncQueue;
      case 'email-digest':
        return this.emailDigestQueue;
      case 'ad-bulk-upload':
        return this.adBulkUploadQueue;
      case 'ad-optimization':
        return this.adOptimizationQueue;
      case 'telegram-distribute':
        return this.telegramDistributeQueue;
      case 'analytics-facebook':
        return this.analyticsFacebookQueue;
      case 'analytics-threads':
        return this.analyticsThreadsQueue;
      default:
        return this.defaultQueue;
    }
  }

  getJob<T = Record<string, unknown>>(
    jobId: string,
    queueName: string = 'default',
  ): Promise<Job<T> | undefined> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId) as Promise<Job<T> | undefined>;
  }

  getJobs<T = Record<string, unknown>>(
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start?: number,
    end?: number,
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getJobs([status], start, end) as Promise<Job<T>[]>;
  }

  clean(
    grace: number,
    status: 'completed' | 'failed',
    queueName: string = 'default',
  ): Promise<string[]> {
    const queue = this.getQueue(queueName);
    // BullMQ clean method returns array of removed job IDs
    return queue.clean(grace, 0, status);
  }

  async pause(queueName: string = 'default'): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  async resume(queueName: string = 'default'): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  isPaused(queueName: string = 'default'): Promise<boolean> {
    const queue = this.getQueue(queueName);
    return queue.isPaused();
  }

  getWaiting<T = Record<string, unknown>>(
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getWaiting() as Promise<Job<T>[]>;
  }

  getActive<T = Record<string, unknown>>(
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getActive() as Promise<Job<T>[]>;
  }

  getCompleted<T = Record<string, unknown>>(
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getCompleted() as Promise<Job<T>[]>;
  }

  getFailed<T = Record<string, unknown>>(
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getFailed() as Promise<Job<T>[]>;
  }

  getDelayed<T = Record<string, unknown>>(
    queueName: string = 'default',
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return queue.getDelayed() as Promise<Job<T>[]>;
  }

  async getCounts(queueName: string = 'default'): Promise<{
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
