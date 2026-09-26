import type { IMediaPerceptionCandidate } from '@genfeedai/contracts/interfaces';
import {
  MEDIA_MODERATION_QUEUE,
  type MediaModerationJobData,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/** A job that exhausted its attempts blocks its asset for this long. */
const FAILED_JOB_RETENTION_SECONDS = 30 * 60;

/**
 * Producer for `MEDIA_MODERATION_QUEUE` (#4880). One live job per asset; the
 * moderation service itself skips an asset whose perception is not ready, so
 * enqueueing early is harmless and the sweep re-offers it later.
 */
@Injectable()
export class MediaModerationQueueService {
  constructor(
    @InjectQueue(MEDIA_MODERATION_QUEUE)
    private readonly queue: Queue<MediaModerationJobData>,
  ) {}

  async enqueue(candidate: IMediaPerceptionCandidate): Promise<void> {
    await this.queue.add(
      'moderate',
      {
        ingredientId: candidate.ingredientId,
        organizationId: candidate.organizationId,
      },
      {
        attempts: 3,
        backoff: { delay: 60_000, type: 'exponential' },
        jobId: `media-moderation-${candidate.ingredientId}`,
        removeOnComplete: true,
        removeOnFail: { age: FAILED_JOB_RETENTION_SECONDS },
      },
    );
  }
}
