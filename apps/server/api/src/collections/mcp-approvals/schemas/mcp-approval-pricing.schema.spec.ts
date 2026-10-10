import { testMcpApprovalPricing } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.fixture';
import {
  approvalGenerationConstraint,
  approvalGenerationQuote,
  readMcpApprovalPricing,
} from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { describe, expect, it } from 'vitest';

describe('immutable MCP consent pricing evidence', () => {
  it('round-trips the canonical quote separately from its public cost summary and admission constraint', () => {
    const price = testMcpApprovalPricing();
    expect(readMcpApprovalPricing(JSON.parse(JSON.stringify(price)))).toEqual(
      price,
    );
    expect(approvalGenerationQuote(price)).toEqual({
      credits: price.credits,
      isAvailable: true,
      modelKey: 'selected-model',
    });
    expect(approvalGenerationConstraint(price)).toEqual({
      model: 'selected-model',
      unitCredits: price.credits,
      billingMode: 'credits',
      pricingHash: price.pricingHash,
      provider: price.snapshot.provider,
      maximumCredits: price.credits,
      quantities: price.snapshot.quantities,
    });
  });

  it.each(['credits', 'pricingHash', 'model', 'quantities', 'unknownField'])(
    'rejects a modified %s instead of consenting to a different charge',
    (field) => {
      const price = testMcpApprovalPricing();
      const modified =
        field === 'credits'
          ? { ...price, credits: 999 }
          : field === 'pricingHash'
            ? { ...price, pricingHash: '0'.repeat(64) }
            : field === 'model'
              ? {
                  ...price,
                  snapshot: { ...price.snapshot, modelKey: 'other-model' },
                }
              : field === 'quantities'
                ? {
                    ...price,
                    snapshot: {
                      ...price.snapshot,
                      quantities: { ...price.snapshot.quantities, outputs: 8 },
                    },
                  }
                : { ...price, callerEstimatedCredits: 999 };
      expect(readMcpApprovalPricing(modified)).toBeNull();
      expect(approvalGenerationQuote(modified)).toBeNull();
      expect(approvalGenerationConstraint(modified)).toBeNull();
    },
  );

  it('preserves a zero Genfeed charge only for a matching frozen BYOK quote', () => {
    const price = testMcpApprovalPricing();
    const byok = { ...price, billingMode: 'byok', credits: 0 };
    expect(readMcpApprovalPricing(byok)).toMatchObject({
      credits: 0,
      billingMode: 'byok',
    });
    expect(approvalGenerationConstraint(byok)).toMatchObject({
      unitCredits: price.credits,
      billingMode: 'byok',
    });
    expect(readMcpApprovalPricing({ ...byok, credits: 1 })).toBeNull();
  });
});
