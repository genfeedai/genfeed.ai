import type { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import {
  CONTEXT_EMBEDDING_QUEUE,
  type ContextEmbeddingJobData,
} from '@genfeedai/contracts/queue';
import { ContextEmbeddingProcessor } from '@workers/processors/api/queues/context-embedding/context-embedding.processor';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

describe('context embedding worker', () => {
  it('consumes the dedicated two-slot queue and delegates only durable identity', async () => {
    const service = { process: vi.fn().mockResolvedValue(undefined) };
    const processor = new ContextEmbeddingProcessor(
      service as unknown as ContextEmbeddingService,
    );
    const data = { jobId: 'intent', organizationId: 'org', generation: 2 };
    await processor.process({ data } as Job<ContextEmbeddingJobData>);
    expect(service.process).toHaveBeenCalledExactlyOnceWith(data);
    expect(
      Reflect.getMetadata(
        'bullmq:processor_metadata',
        ContextEmbeddingProcessor,
      ),
    ).toEqual({ name: CONTEXT_EMBEDDING_QUEUE });
    expect(
      Reflect.getMetadata('bullmq:worker_metadata', ContextEmbeddingProcessor),
    ).toEqual({ concurrency: 2 });
  });
  it('surfaces database failure so worker transport cannot falsely report completion', async () => {
    const failure = new Error('database unavailable');
    const service = { process: vi.fn().mockRejectedValue(failure) };
    const processor = new ContextEmbeddingProcessor(
      service as unknown as ContextEmbeddingService,
    );
    await expect(
      processor.process({
        data: { jobId: 'i', organizationId: 'org', generation: 1 },
      } as Job<ContextEmbeddingJobData>),
    ).rejects.toBe(failure);
  });
});
