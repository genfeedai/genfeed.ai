import {
  InsightGenerationQueueService,
  insightGenerationJobId,
} from '@server/queues/insight-generation/insight-generation-queue.service';
import { INSIGHT_GENERATION_JOB_NAME } from '@genfeedai/queue-contracts';
import { describe, expect, it, vi } from 'vitest';

describe('InsightGenerationQueueService', () => {
  it('enqueues one deterministic job per organization', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'insight-generate-org-1' }),
      getJob: vi.fn().mockResolvedValue(null),
    };
    const service = new InsightGenerationQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      queue as never,
    );

    await expect(
      service.enqueueGeneration({ limit: 5, organizationId: 'org-1' }),
    ).resolves.toBe('insight-generate-org-1');

    expect(queue.add).toHaveBeenCalledWith(
      INSIGHT_GENERATION_JOB_NAME,
      { limit: 5, organizationId: 'org-1' },
      expect.objectContaining({ jobId: 'insight-generate-org-1' }),
    );
    expect(insightGenerationJobId('org-1')).not.toContain(':');
  });

  it('reuses an in-flight org lease instead of adding a second job', async () => {
    const queue = {
      add: vi.fn(),
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
      }),
    };
    const service = new InsightGenerationQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      queue as never,
    );

    await expect(
      service.enqueueGeneration({ limit: 5, organizationId: 'org-1' }),
    ).resolves.toBe('insight-generate-org-1');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
