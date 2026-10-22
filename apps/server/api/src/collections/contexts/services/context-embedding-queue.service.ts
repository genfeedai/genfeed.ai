import {
  CONTEXT_EMBEDDING_QUEUE,
  type ContextEmbeddingJobData,
} from '@genfeedai/contracts/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class ContextEmbeddingQueueService {
  constructor(
    @InjectQueue(CONTEXT_EMBEDDING_QUEUE)
    private readonly queue: Queue<ContextEmbeddingJobData>,
  ) {}

  async enqueue(data: ContextEmbeddingJobData): Promise<void> {
    await this.queue.add('embed', data, {
      attempts: 1,
      jobId: `context-embedding-${data.jobId}-${data.generation}`,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
