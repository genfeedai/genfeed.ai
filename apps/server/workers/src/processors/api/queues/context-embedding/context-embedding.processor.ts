import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import {
  CONTEXT_EMBEDDING_QUEUE,
  type ContextEmbeddingJobData,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(CONTEXT_EMBEDDING_QUEUE, { concurrency: 2 })
export class ContextEmbeddingProcessor extends WorkerHost {
  constructor(private readonly embeddings: ContextEmbeddingService) {
    super();
  }

  async process(job: Job<ContextEmbeddingJobData>): Promise<void> {
    await this.embeddings.process(job.data);
  }
}
