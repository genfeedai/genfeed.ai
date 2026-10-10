import { AgentMediaTurboRunService } from '@api/services/agent-orchestrator/tools/agent-media-turbo-run.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentMediaTurboRunService internal strategy attribution', () => {
  it('passes context strategy after idempotency key and rejects before reserve', async () => {
    const turboRuns = {
      createTurboRun: vi.fn().mockRejectedValue(new Error('invalid strategy')),
    };
    const credits = { reserveCredits: vi.fn() };
    const service = new AgentMediaTurboRunService(
      { warn: vi.fn() } as never,
      { findOne: vi.fn().mockResolvedValue({ id: 'brand' }) },
      { findOne: vi.fn() } as never,
      {} as never,
      turboRuns as never,
      undefined,
      credits as never,
    );
    const result = await service.generateTurboContent(
      { count: 1, platforms: ['instagram'], strategyId: 'spoofed' },
      {
        brandId: 'brand',
        organizationId: 'org',
        userId: 'owner',
        strategyId: 'trusted',
      } as never,
    );
    expect(turboRuns.createTurboRun).toHaveBeenCalledWith(
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
