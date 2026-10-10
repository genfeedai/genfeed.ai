import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { AgentGenerationQuote } from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

export const mcpApprovalPricingSchema = z
  .object({
    version: z.literal(1),
    credits: z.number().int().nonnegative(),
    billingMode: z.enum(['credits', 'byok']),
    pricingHash: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: modelBillableQuoteSnapshotSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const { quotedAt: _quotedAt, ...identity } = value.snapshot;
    if (
      value.credits !==
        (value.billingMode === 'byok' ? 0 : value.snapshot.credits) ||
      value.pricingHash !== quoteSnapshotHash(identity)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Approval quote evidence is inconsistent',
      });
    }
  });

export type McpApprovalPricingEvidence = z.infer<
  typeof mcpApprovalPricingSchema
>;

export function readMcpApprovalPricing(
  value: unknown,
): McpApprovalPricingEvidence | null {
  const parsed = mcpApprovalPricingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function approvalGenerationQuote(
  value: unknown,
): AgentGenerationQuote | null {
  const pricing = readMcpApprovalPricing(value);
  return pricing
    ? {
        credits: pricing.credits,
        isAvailable: true,
        modelKey: pricing.snapshot.modelKey,
      }
    : null;
}

export function approvalGenerationConstraint(
  value: unknown,
): ApprovedGenerationQuoteConstraint | null {
  const pricing = readMcpApprovalPricing(value);
  return pricing
    ? {
        model: pricing.snapshot.modelKey,
        unitCredits: pricing.snapshot.credits,
        billingMode: pricing.billingMode,
        pricingHash: pricing.pricingHash,
        provider: pricing.snapshot.provider,
        maximumCredits: pricing.credits,
        quantities: pricing.snapshot.quantities,
      }
    : null;
}
