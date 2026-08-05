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
  QueueDegradationReason,
  type QueueDispatchResult,
  QueueDispatchStatus,
  SOCIAL_INBOX_SYNC_QUEUE,
  SOCIAL_REPLY_CAMPAIGN_QUEUE,
  TELEGRAM_DISTRIBUTE_QUEUE,
} from '@genfeedai/queue-contracts';
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
    @InjectQueue(SOCIAL_REPLY_CAMPAIGN_QUEUE)
    private readonly socialReplyCampaignQueue: Queue,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  add<T = Record<string, unknown>>(
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
      case SOCIAL_REPLY_CAMPAIGN_QUEUE:
        return this.socialReplyCampaignQueue;
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
