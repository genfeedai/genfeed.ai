/**
 * HeyGen Poll Queue Service
 *
 * Schedules delayed polling jobs that check HeyGen video status via
 * HeygenAvatarProvider.getStatus. Used as a fallback for localhost /
 * self-hosted deployments where GENFEEDAI_WEBHOOKS_URL is not reachable
 * from HeyGen.
 *
 * In cloud deployments, HeyGen delivers completion via webhook
 * (POST /v1/webhooks/heygen/callback) and this queue is a no-op.
 */
import {
  HEYGEN_POLL_DELAY_MS,
  HEYGEN_POLL_QUEUE,
  HeygenPollJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class HeygenPollQueueService {
  private readonly logContext = 'HeygenPollQueueService';

  constructor(
    @InjectQueue(HEYGEN_POLL_QUEUE)
    @Optional()
    private readonly queue: Queue<HeygenPollJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Schedule a poll attempt. Uses a non-deterministic job ID so that
   * reschedules from inside the processor do not collide with the
   * initial job.
   */
  async schedule(
    data: Omit<HeygenPollJobData, 'attempt'> & { attempt?: number },
    delayMs: number = HEYGEN_POLL_DELAY_MS,
  ): Promise<string | undefined> {
    if (!this.queue) {
      this.logger.warn(
        `${this.logContext}: queue not available, skipping schedule`,
      );
      return undefined;
    }

    const attempt = data.attempt ?? 1;
    const jobId = `heygen-poll-${data.ingredientId}-${attempt}`;
    const job = await this.queue.add(
      'poll-heygen-video',
      { ...data, attempt },
      {
        attempts: 2,
        backoff: { delay: 5000, type: 'exponential' },
        delay: delayMs,
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`${this.logContext}: scheduled poll attempt ${attempt}`, {
      delayMs,
      externalId: data.externalId,
      ingredientId: data.ingredientId,
      jobId: job.id,
      taskId: data.taskId,
    });

    return job.id ?? undefined;
  }
}
