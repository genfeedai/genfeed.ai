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
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface HeygenPollJobData {
  /** Ingredient ID that owns the HeyGen generation (used as callbackId). */
  ingredientId: string;
  /** HeyGen external task/video id returned by generatePhotoAvatarVideo. */
  externalId: string;
  /** Organization context for BYOK resolution. */
  organizationId: string;
  /** Workspace task ID so we can broadcast completion events to the UI. */
  taskId: string;
  /** User who submitted the task (for task event attribution). */
  userId: string;
  /** Attempt counter — job reschedules itself with this incremented. */
  attempt: number;
}

export const HEYGEN_POLL_QUEUE_NAME = 'heygen-poll';
export const HEYGEN_POLL_DELAY_MS = 15_000;
export const HEYGEN_POLL_MAX_ATTEMPTS = 40; // ≈10 min ceiling at 15s cadence

@Injectable()
export class HeygenPollQueueService {
  private readonly logContext = 'HeygenPollQueueService';

  constructor(
    @InjectQueue(HEYGEN_POLL_QUEUE_NAME)
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
