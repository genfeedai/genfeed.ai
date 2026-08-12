import type { InsightGenerationJobData } from '@genfeedai/queue-contracts';
import { InsightGenerationProcessor } from '@workers/processors/api/queues/insight-generation/insight-generation.processor';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

function makeJob(
  data: InsightGenerationJobData,
): Job<InsightGenerationJobData> {
  return { data } as Job<InsightGenerationJobData>;
}

describe('InsightGenerationProcessor', () => {
  it('fills insights for the leased organization', async () => {
    const insightsService = {
      generateInsightsIfNeeded: vi.fn().mockResolvedValue([]),
    };
    const processor = new InsightGenerationProcessor(
      insightsService as never,
      { warn: vi.fn() } as never,
    );

    await processor.process(makeJob({ limit: 5, organizationId: 'org-1' }));

    expect(insightsService.generateInsightsIfNeeded).toHaveBeenCalledWith(
      'org-1',
      5,
    );
  });
});
