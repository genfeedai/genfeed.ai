import { VIDEO_COMPLETION_QUEUE } from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';

/** The terminal state of one files-service video job, read by the worker that settles the ingredient. */
export interface VideoCompletionQueueEvent {
  editorRender?: unknown;
  error?: string;
  ingredientId: string;
  organizationId: string;
  result?: unknown;
  status: 'completed' | 'failed';
  terminalAttempt?: number;
  terminalReason?: string;
  timestamp: string;
  userId?: string;
}

/**
 * A completed event is the only record that a job finished: the consumer takes
 * it, however many times and however long after the files service wrote it.
 * Five attempts over about a minute outlast a worker task rolling at a deploy.
 */
export const VIDEO_COMPLETION_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { delay: 2000, type: 'exponential' },
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

@Injectable()
export class VideoCompletionPublisherService {
  constructor(
    @InjectQueue(VIDEO_COMPLETION_QUEUE)
    private readonly queue: Queue<VideoCompletionQueueEvent>,
  ) {}

  /** Rejects when the event was not stored, so the caller can fail its own job and run again. */
  async publish(event: VideoCompletionQueueEvent): Promise<void> {
    await this.queue.add(
      VIDEO_COMPLETION_QUEUE,
      event,
      VIDEO_COMPLETION_JOB_OPTIONS,
    );
  }
}
