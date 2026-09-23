import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentMediaBatchGenerationService internal strategy attribution', () => {
  it('passes context strategy after idempotency key and rejects before reserve', async () => {
    const batches = {
      createBatch: vi.fn().mockRejectedValue(new Error('invalid strategy')),
    };
    const credits = { reserveCredits: vi.fn() };
    const service = new AgentMediaBatchGenerationService(
      { warn: vi.fn() } as never,
      { findOne: vi.fn().mockResolvedValue({ id: 'brand' }) },
      {} as never,
      batches as never,
      undefined,
      credits as never,
    );
    const result = await service.generateContentBatch(
      { count: 1, platforms: ['instagram'], strategyId: 'spoofed' },
      {
        brandId: 'brand',
        organizationId: 'org',
        userId: 'owner',
        strategyId: 'trusted',
      } as never,
    );
    expect(batches.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand' }),
      'owner',
      'org',
      undefined,
      'trusted',
    );
    expect(result.success).toBe(false);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });
});
