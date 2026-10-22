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
  it('fits the specified 200-job engineering envelope into 420 seconds under a fake clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      let active = 0;
      let maximum = 0;
      let completed = 0;
      let next = 0;
      let searchable = false;
      const delay = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      const service = {
        process: vi.fn(async () => {
          active++;
          maximum = Math.max(maximum, active);
          await delay(2000); // Specified healthy-provider envelope.
          await delay(1000); // Specified database-stage envelope.
          active--;
          completed++;
        }),
      };
      const processor = new ContextEmbeddingProcessor(
        service as unknown as ContextEmbeddingService,
      );
      expect(
        Reflect.getMetadata(
          'bullmq:worker_metadata',
          ContextEmbeddingProcessor,
        ),
      ).toEqual({ concurrency: 2 });
      const run = (async () => {
        await delay(60000); // Worst-case next admitted-intent recovery tick.
        await Promise.all(
          Array.from({ length: 2 }, async () => {
            while (next < 200) {
              const index = next++;
              await processor.process({
                data: {
                  jobId: 'envelope-' + index,
                  organizationId: 'org',
                  generation: 1,
                },
              } as Job<ContextEmbeddingJobData>);
            }
          }),
        );
        await delay(60000); // Worst-case next bounded completion tick.
        searchable = true;
      })();
      await vi.advanceTimersByTimeAsync(419999);
      expect(completed).toBe(200);
      expect(searchable).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(searchable).toBe(true);
      expect(Date.now()).toBe(420000);
      expect(Date.now()).toBeLessThan(600000);
      expect(maximum).toBe(2);
      expect(service.process).toHaveBeenCalledTimes(200);
    } finally {
      vi.useRealTimers();
    }
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
