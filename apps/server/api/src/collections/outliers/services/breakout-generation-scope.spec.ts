import { runWithStrategyBudgetAttribution } from '@api/collections/credits/services/strategy-budget-attribution.context';
import { breakoutGenerationScope } from '@api/collections/outliers/services/breakout-generation-admission.util';
import { Platform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

// Runs the real strict attribution parser; no admission util is mocked here.
describe('breakout generation attribution scope', () => {
  const input = {
    organizationId: 'org-a',
    brandId: 'brand-a',
    platform: Platform.TWITTER,
    strategyId: 'strategy-a',
    format: 'text' as const,
  };

  it('contains exactly the attribution keys and never the account', () => {
    expect(
      breakoutGenerationScope({
        ...input,
        credentialId: 'credential-a',
      } as typeof input),
    ).toEqual({ version: 1, ...input });
  });

  it('is accepted by the real strategy budget attribution context', async () => {
    const findFirst = vi.fn(async () => ({
      id: 'strategy-a',
      platforms: [Platform.TWITTER],
    }));
    await expect(
      runWithStrategyBudgetAttribution(
        { agentStrategy: { findFirst } } as never,
        breakoutGenerationScope(input),
        async () => 'ran',
      ),
    ).resolves.toBe('ran');
  });

  it('is what the old spread of the request scope was not', async () => {
    const findFirst = vi.fn(async () => ({
      id: 'strategy-a',
      platforms: [Platform.TWITTER],
    }));
    await expect(
      runWithStrategyBudgetAttribution(
        { agentStrategy: { findFirst } } as never,
        { version: 1, ...input, credentialId: 'credential-a' } as never,
        async () => 'ran',
      ),
    ).rejects.toThrow(/credentialId/);
  });
});
