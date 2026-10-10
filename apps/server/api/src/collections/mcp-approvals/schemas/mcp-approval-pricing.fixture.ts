import type { McpApprovalPricingEvidence } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';

/** Canonical deliberate test tariff, never a production pricing fallback. */
export function testMcpApprovalPricing(
  credits = 2,
): McpApprovalPricingEvidence {
  const quoted = quoteModelBillablePricing(
    billableProfile({ key: 'selected-model', cost: credits }),
    {
      modelKey: 'selected-model',
      provider: 'replicate',
      outputs: 1,
      requests: 1,
    },
    1,
    '2026-10-10T10:00:00.000Z',
  );
  if (quoted.status !== 'priced') throw new Error(quoted.reason);
  const { quotedAt: _quotedAt, ...identity } = quoted.snapshot;
  return {
    version: 1,
    credits: quoted.snapshot.credits,
    billingMode: 'credits',
    pricingHash: quoteSnapshotHash(identity),
    snapshot: quoted.snapshot,
  };
}
