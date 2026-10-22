import { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import type { ContextEmbeddingJobData } from '@genfeedai/contracts/queue';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

describe('durable context embedding queue transport', () => {
  it('offers only bounded identity while the database owns retry attempts', async () => {
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const service = new ContextEmbeddingQueueService(
      queue as unknown as Queue<ContextEmbeddingJobData>,
    );
    await service.enqueue({
      jobId: 'durable-id',
      organizationId: 'org',
      generation: 2,
    });
    expect(queue.add).toHaveBeenCalledExactlyOnceWith(
      'embed',
      { jobId: 'durable-id', organizationId: 'org', generation: 2 },
      {
        attempts: 1,
        jobId: 'context-embedding-durable-id-2',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });
});
