import type { IMediaPerceptionCandidate } from '@genfeedai/contracts/interfaces';
import {
  MEDIA_PERCEPTION_QUEUE,
  type MediaPerceptionJobData,
  type MediaPerceptionJobReason,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * How long a job that exhausted its attempts keeps its id. Short on purpose:
 * once it expires the sweep offers the asset again while it is still inside
 * the lookback window, so a transient outage never strands an asset.
 */
const FAILED_JOB_RETENTION_SECONDS = 30 * 60;

/**
 * Producer for `MEDIA_PERCEPTION_QUEUE` (#4879). One live job per asset and
 * reason: the job id deduplicates a sweep that sees the same asset twice.
 * Transient failures retry with backoff inside the job; a job that still
 * fails keeps its id for half an hour so a broken asset is not
 * re-fingerprinted on every two-minute sweep.
 */
@Injectable()
export class MediaPerceptionQueueService {
  constructor(
    @InjectQueue(MEDIA_PERCEPTION_QUEUE)
    private readonly queue: Queue<MediaPerceptionJobData>,
  ) {}

  async enqueue(
    candidate: IMediaPerceptionCandidate,
    reason: MediaPerceptionJobReason,
  ): Promise<void> {
    await this.queue.add(
      reason,
      {
        ingredientId: candidate.ingredientId,
        organizationId: candidate.organizationId,
        reason,
      },
      {
        attempts: 3,
        backoff: { delay: 60_000, type: 'exponential' },
        jobId: `media-perception-${reason}-${candidate.ingredientId}`,
        removeOnComplete: true,
        removeOnFail: { age: FAILED_JOB_RETENTION_SECONDS },
      },
    );
  }
}
