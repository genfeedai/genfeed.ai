import {
  AD_BULK_UPLOAD_QUEUE,
  AD_OPTIMIZATION_QUEUE,
  AD_SYNC_GOOGLE_QUEUE,
  AD_SYNC_META_QUEUE,
  AD_SYNC_TIKTOK_QUEUE,
  ANALYTICS_FACEBOOK_QUEUE,
  ANALYTICS_SOCIAL_QUEUE,
  ANALYTICS_SYNC_QUEUE,
  ANALYTICS_THREADS_QUEUE,
  ANALYTICS_TWITTER_QUEUE,
  ANALYTICS_YOUTUBE_QUEUE,
  DEFAULT_QUEUE,
  EMAIL_DIGEST_QUEUE,
  SOCIAL_INBOX_SYNC_QUEUE,
  TELEGRAM_DISTRIBUTE_QUEUE,
} from '@genfeedai/queue-contracts';
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
    @InjectQueue(ANALYTICS_TWITTER_QUEUE)
    private readonly analyticsTwitterQueue: Queue,
    @InjectQueue(ANALYTICS_YOUTUBE_QUEUE)
    private readonly analyticsYouTubeQueue: Queue,
    @InjectQueue(ANALYTICS_SOCIAL_QUEUE)
    private readonly analyticsSocialQueue: Queue,
    @InjectQueue(AD_SYNC_META_QUEUE)
    private readonly adSyncMetaQueue: Queue,
    @InjectQueue(AD_SYNC_GOOGLE_QUEUE)
    private readonly adSyncGoogleQueue: Queue,
    @InjectQueue(AD_SYNC_TIKTOK_QUEUE)
    private readonly adSyncTikTokQueue: Queue,
    @InjectQueue(ANALYTICS_SYNC_QUEUE)
    private readonly analyticsSyncQueue: Queue,
    @InjectQueue(EMAIL_DIGEST_QUEUE)
    private readonly emailDigestQueue: Queue,
    @InjectQueue(AD_BULK_UPLOAD_QUEUE)
    private readonly adBulkUploadQueue: Queue,
    @InjectQueue(AD_OPTIMIZATION_QUEUE)
    private readonly adOptimizationQueue: Queue,
    @InjectQueue(TELEGRAM_DISTRIBUTE_QUEUE)
    private readonly telegramDistributeQueue: Queue,
    @InjectQueue(ANALYTICS_FACEBOOK_QUEUE)
    private readonly analyticsFacebookQueue: Queue,
    @InjectQueue(ANALYTICS_THREADS_QUEUE)
    private readonly analyticsThreadsQueue: Queue,
    @InjectQueue(SOCIAL_INBOX_SYNC_QUEUE)
    private readonly socialInboxSyncQueue: Queue,
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
      case ANALYTICS_TWITTER_QUEUE:
        return this.analyticsTwitterQueue;
      case ANALYTICS_YOUTUBE_QUEUE:
        return this.analyticsYouTubeQueue;
      case ANALYTICS_SOCIAL_QUEUE:
        return this.analyticsSocialQueue;
      case AD_SYNC_META_QUEUE:
        return this.adSyncMetaQueue;
      case AD_SYNC_GOOGLE_QUEUE:
        return this.adSyncGoogleQueue;
      case AD_SYNC_TIKTOK_QUEUE:
        return this.adSyncTikTokQueue;
      case ANALYTICS_SYNC_QUEUE:
        return this.analyticsSyncQueue;
      case EMAIL_DIGEST_QUEUE:
        return this.emailDigestQueue;
      case AD_BULK_UPLOAD_QUEUE:
        return this.adBulkUploadQueue;
      case AD_OPTIMIZATION_QUEUE:
        return this.adOptimizationQueue;
      case TELEGRAM_DISTRIBUTE_QUEUE:
        return this.telegramDistributeQueue;
      case ANALYTICS_FACEBOOK_QUEUE:
        return this.analyticsFacebookQueue;
      case ANALYTICS_THREADS_QUEUE:
        return this.analyticsThreadsQueue;
      case SOCIAL_INBOX_SYNC_QUEUE:
        return this.socialInboxSyncQueue;
      default:
        return this.defaultQueue;
    }
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
