import { ProviderPriceSyncService } from '@api/endpoints/admin/model-pricing/provider-price-sync.service';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

describe('ProviderPriceSyncService', () => {
  it('enqueues the schedule task for each requested provider', async () => {
    const add = vi.fn(async (name: string) => ({ id: `job-${name}` }));
    const service = new ProviderPriceSyncService({ add } as unknown as Queue);

    const queued = await service.enqueue(['fal', 'replicate']);

    expect(queued).toEqual([
      { jobId: 'job-fal-model-discovery', provider: 'fal' },
      { jobId: 'job-replicate-model-discovery', provider: 'replicate' },
    ]);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(
      'fal-model-discovery',
      {},
      expect.objectContaining({
        attempts: 1,
        jobId: expect.stringMatching(/^manual-fal-model-discovery-\d+$/),
      }),
    );
  });

  it('enqueues only the requested provider', async () => {
    const add = vi.fn(async () => ({ id: 'job-1' }));
    const service = new ProviderPriceSyncService({ add } as unknown as Queue);

    await service.enqueue(['replicate']);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0]).toBe('replicate-model-discovery');
  });
});
