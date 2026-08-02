/**
 * Social Reply Campaign Queue Service
 *
 * Owns the single-tick drip that paces a throttled reply campaign. Each tick
 * claims at most one recipient and enqueues its own successor with a delay, so
 * pacing lives in the BullMQ delay rather than in a worker-blocking sleep and
 * nothing is added to the legacy cron surface.
 *
 * The job id embeds the campaign's `dispatchCursor`. A pause leaves its delayed
 * job behind; resuming bumps the cursor, which both mints a fresh id and makes
 * the orphan's payload fail the staleness check when it eventually lands.
 */
import {
  SOCIAL_REPLY_CAMPAIGN_QUEUE,
  SocialReplyCampaignJobData,
} from '@genfeedai/queue-contracts';
import { reserveIdempotentJob } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const SOCIAL_REPLY_CAMPAIGN_JOB_NAME = 'dispatch-social-reply-campaign';

export function buildSocialReplyCampaignJobId(
  campaignId: string,
  dispatchCursor: number,
): string {
  return `social-reply-campaign-${campaignId}-${dispatchCursor}`;
}

@Injectable()
export class SocialReplyCampaignQueueService {
  private readonly logContext = 'SocialReplyCampaignQueueService';

  constructor(
    @InjectQueue(SOCIAL_REPLY_CAMPAIGN_QUEUE)
    private readonly queue: Queue<SocialReplyCampaignJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Schedule the next dispatch tick. `delaySeconds` is the campaign's own
   * pacing decision — the minimum inter-send delay, or the remainder of an
   * exhausted hourly/daily window.
   */
  async enqueueTick(
    data: SocialReplyCampaignJobData,
    delaySeconds = 0,
  ): Promise<string> {
    const url = `${this.logContext} ${CallerUtil.getCallerName()}`;
    const jobId = buildSocialReplyCampaignJobId(
      data.campaignId,
      data.dispatchCursor,
    );

    const reservation = await reserveIdempotentJob(this.queue, jobId);
    if (reservation.alreadyQueued) {
      this.logger.warn(
        `${url} campaign ${data.campaignId} tick already queued (${reservation.state})`,
      );
      return jobId;
    }

    const job = await this.queue.add(SOCIAL_REPLY_CAMPAIGN_JOB_NAME, data, {
      attempts: 3,
      backoff: { delay: 10_000, type: 'exponential' },
      delay: Math.max(Math.round(delaySeconds * 1000), 0),
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`${url} queued campaign dispatch tick`, {
      campaignId: data.campaignId,
      delaySeconds,
      jobId: job.id,
    });

    return job.id ?? jobId;
  }

  /**
   * Drop the delayed tick a pause or cancel orphaned. Best-effort: an already
   * running tick still short-circuits on the campaign's status.
   */
  async removeTick(campaignId: string, dispatchCursor: number): Promise<void> {
    const jobId = buildSocialReplyCampaignJobId(campaignId, dispatchCursor);
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return;
    }

    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      this.logger.log(`${this.logContext} removed pending dispatch tick`, {
        campaignId,
        jobId,
      });
    }
  }
}
