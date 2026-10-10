import { testMcpApprovalPricing } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.fixture';
import { approvalGenerationConstraint } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { assertApprovedGenerationQuote } from '@api/helpers/utils/credits/approved-generation-quote.util';
import { describe, expect, it } from 'vitest';

describe('approved generation admission', () => {
  it('accepts the same prepared request quoted later', () => {
    const evidence = testMcpApprovalPricing();
    const approved = approvalGenerationConstraint(evidence);
    if (!approved) throw new Error('test quote unavailable');
    expect(() =>
      assertApprovedGenerationQuote(
        approved,
        { ...evidence.snapshot, quotedAt: '2026-10-11T00:00:00.000Z' },
        false,
      ),
    ).not.toThrow();
  });
  it.each([
    'model',
    'provider',
    'price',
    'tariff',
    'outputs',
    'width',
    'billing',
    'ceiling',
  ] as const)('rejects changed %s, including equal-cost settings', (change) => {
    const evidence = testMcpApprovalPricing();
    const approved = approvalGenerationConstraint(evidence);
    if (!approved) throw new Error('test quote unavailable');
    const actual = {
      ...evidence.snapshot,
      quantities: { ...evidence.snapshot.quantities },
    };
    if (change === 'model') actual.modelKey = 'other';
    if (change === 'provider') actual.provider = 'fal';
    if (change === 'price') actual.credits += 1;
    if (change === 'tariff') actual.rateVersion = 'other';
    if (change === 'outputs') actual.quantities.outputs = 2;
    if (change === 'width') actual.quantities.width = 2048;
    expect(() =>
      assertApprovedGenerationQuote(
        change === 'ceiling' ? { ...approved, maximumCredits: 0 } : approved,
        actual,
        change === 'billing',
      ),
    ).toThrow('fresh quote');
  });
  it('accepts frozen BYOK zero and rejects a switch to wallet billing', () => {
    const evidence = testMcpApprovalPricing();
    const approved = approvalGenerationConstraint({
      ...evidence,
      credits: 0,
      billingMode: 'byok',
    });
    if (!approved) throw new Error('test quote unavailable');
    expect(() =>
      assertApprovedGenerationQuote(approved, evidence.snapshot, true),
    ).not.toThrow();
    expect(() =>
      assertApprovedGenerationQuote(approved, evidence.snapshot, false),
    ).toThrow();
  });
});
