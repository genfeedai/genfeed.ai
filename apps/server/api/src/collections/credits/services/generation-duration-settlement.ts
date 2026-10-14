import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { z } from 'zod';

/** Hold metadata a per-second output carries from admission (#6624). */
const heldDurationQuoteSchema = z.object({
  avatarDurationQuote: z.object({
    estimatedSeconds: z.number().finite().positive(),
    snapshot: modelBillableQuoteSnapshotSchema,
  }),
});

export type HeldDurationQuote = z.infer<
  typeof heldDurationQuoteSchema
>['avatarDurationQuote'];

export interface DurationSettlement {
  /** Credits the hold settles at: the re-priced clip, capped at the hold. */
  settleCredits: number;
  /** Credits charged on top of the hold when the clip ran longer. */
  topUpCredits: number;
  actualSeconds?: number;
  actualCredits?: number;
  /** Why the hold settled at its estimate instead of the clip duration. */
  unresolvedReason?: string;
}

export function readHeldDurationQuote(
  metadata: unknown,
): HeldDurationQuote | undefined {
  const parsed = heldDurationQuoteSchema.safeParse(metadata);
  return parsed.success ? parsed.data.avatarDurationQuote : undefined;
}

/**
 * Re-prices the frozen admission quote at the clip duration the provider
 * returned. The rate, margin and quote date stay the admitted ones; only the
 * seconds change. A shorter clip settles below the hold (the rest is
 * refunded), a longer one settles the whole hold plus a top-up. Without a
 * usable duration or price the hold settles at its estimate, never at zero.
 */
export function resolveDurationSettlement(
  heldCredits: number,
  quote: HeldDurationQuote,
  actualSeconds: number | undefined,
): DurationSettlement {
  const estimate = (unresolvedReason: string): DurationSettlement => ({
    settleCredits: heldCredits,
    topUpCredits: 0,
    unresolvedReason,
  });
  if (
    actualSeconds === undefined ||
    !Number.isFinite(actualSeconds) ||
    !(actualSeconds > 0)
  )
    return estimate('The provider reported no clip duration');
  const { snapshot } = quote;
  const priced = quoteModelBillablePricing(
    snapshot.pricingProfile,
    {
      ...snapshot.quantities,
      duration: actualSeconds,
      modelKey: snapshot.modelKey,
      provider: snapshot.provider,
    },
    snapshot.marginMultiplier,
    snapshot.quotedAt,
    { kind: 'frozen' },
  );
  if (priced.status === 'unresolved') return estimate(priced.reason);
  const actualCredits = priced.snapshot.credits;
  return {
    actualCredits,
    actualSeconds,
    settleCredits: Math.min(actualCredits, heldCredits),
    topUpCredits: Math.max(0, actualCredits - heldCredits),
  };
}
