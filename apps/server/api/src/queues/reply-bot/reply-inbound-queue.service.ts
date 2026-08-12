import {
  REPLY_POST_WATCH_DELAYS_MINUTES,
  REPLY_POST_WATCH_MAX_ATTEMPTS,
} from '@api/services/reply-bot/reply-post-watch.constants';
import {
  REPLY_INBOUND_QUEUE,
  REPLY_POST_WATCH_QUEUE,
  type ReplyInboundJobData,
  type ReplyPostWatchJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class ReplyInboundQueueService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    @InjectQueue(REPLY_INBOUND_QUEUE)
    private readonly inboundQueue: Queue<ReplyInboundJobData>,
    @InjectQueue(REPLY_POST_WATCH_QUEUE)
    private readonly postWatchQueue: Queue<ReplyPostWatchJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Enqueue a single inbound comment for processing (dedupe via jobId).
   */
  async enqueueInbound(data: ReplyInboundJobData): Promise<{ jobId: string }> {
    const job = await this.inboundQueue.add('inbound', data, {
      jobId: `reply-inbound-${data.organizationId}-${data.commentId}`,
      removeOnComplete: 200,
      removeOnFail: 100,
    });

    this.logger.log(`${this.constructorName} enqueued inbound comment`, {
      commentId: data.commentId,
      jobId: job.id,
      organizationId: data.organizationId,
      source: data.source,
    });

    return { jobId: String(job.id) };
  }

  /**
   * Schedule the 24h post-watch series for an owned post (connect later: call on publish).
   */
  async schedulePostWatch(params: {
    brandId: string;
    organizationId: string;
    postId: string;
    postPreview?: string;
  }): Promise<{ scheduled: number }> {
    let scheduled = 0;

    for (let attempt = 0; attempt < REPLY_POST_WATCH_MAX_ATTEMPTS; attempt++) {
      const delayMinutes = REPLY_POST_WATCH_DELAYS_MINUTES[attempt] ?? 1440;
      const delayMs = delayMinutes * 60 * 1000;
      const jobId = `reply-post-watch-${params.organizationId}-${params.postId}-${attempt}`;

      await this.postWatchQueue.add(
        'watch',
        {
          attempt,
          brandId: params.brandId,
          maxAttempts: REPLY_POST_WATCH_MAX_ATTEMPTS,
          organizationId: params.organizationId,
          postId: params.postId,
          postPreview: params.postPreview,
        },
        {
          delay: delayMs,
          jobId,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
      scheduled += 1;
    }

    this.logger.log(`${this.constructorName} scheduled post-watch series`, {
      brandId: params.brandId,
      organizationId: params.organizationId,
      postId: params.postId,
      scheduled,
    });

    return { scheduled };
  }
}
