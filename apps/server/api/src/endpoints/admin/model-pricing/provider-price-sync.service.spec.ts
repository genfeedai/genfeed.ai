import { ProviderPriceSyncService } from '@api/endpoints/admin/model-pricing/provider-price-sync.service';
import type { JobsOptions, Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

/** A queue that hands back the job id it was asked to use, as BullMQ does. */
function echoingQueue() {
  const add = vi.fn(
    async (_name: string, _data: object, options: JobsOptions) => ({
      id: options.jobId,
    }),
  );
  return { add, queue: { add } as unknown as Queue };
}

describe('ProviderPriceSyncService', () => {
  it('enqueues a single-attempt manual schedule task per provider', async () => {
    const { add, queue } = echoingQueue();
    const service = new ProviderPriceSyncService(queue);

    const queued = await service.enqueue(['fal', 'replicate']);

    expect(queued).toEqual([
      {
        jobId: expect.stringMatching(/^manual-fal-model-discovery-\d+$/),
        provider: 'fal',
      },
      {
        jobId: expect.stringMatching(/^manual-replicate-model-discovery-\d+$/),
        provider: 'replicate',
      },
    ]);
    expect(add).toHaveBeenCalledWith(
      'fal-model-discovery',
      {},
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('enqueues only the requested provider', async () => {
    const { queue } = echoingQueue();
    const service = new ProviderPriceSyncService(queue);

    const queued = await service.enqueue(['replicate']);

    expect(queued).toEqual([
      {
        jobId: expect.stringMatching(/^manual-replicate-model-discovery-\d+$/),
        provider: 'replicate',
      },
    ]);
  });
});
