import type { IMediaPerceptionCandidate } from '@genfeedai/contracts/interfaces';
import {
  MEDIA_PERCEPTION_QUEUE,
  type MediaPerceptionJobData,
  type MediaPerceptionJobReason,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/** How long a failed job keeps its id, blocking re-enqueue of the same asset. */
const FAILED_JOB_RETENTION_SECONDS = 24 * 60 * 60;

/**
 * Producer for `MEDIA_PERCEPTION_QUEUE` (#4879). One live job per asset and
 * reason: the job id deduplicates a sweep that sees the same asset twice, and
 * a failed job is kept for a day so a permanently broken asset is not
 * re-fingerprinted on every sweep.
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
        attempts: 1,
        jobId: `media-perception-${reason}-${candidate.ingredientId}`,
        removeOnComplete: true,
        removeOnFail: { age: FAILED_JOB_RETENTION_SECONDS },
      },
    );
  }
}
