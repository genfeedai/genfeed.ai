import type { ModelPricingRateChange } from '@genfeedai/contracts/interfaces';

import { sellPriceUsdForProviderCost } from './plans-pricing';

/** A pending provider rate that costs more than the rate we sell it at. */
export interface RateChangeBelowCost {
  change: ModelPricingRateChange;
  /** What we charge today for one billed unit, in USD. */
  sellPriceUsd: number;
}

/**
 * The changed variants whose new provider cost is above what we charge today.
 * Our current price for a variant is its approved provider rate through the
 * generation margin, so a rise of more than the multiplier is a loss on every
 * run until the new rate is approved. New and removed variants have no price to
 * compare, so they do not count.
 */
export function findRateChangesAboveSellPrice(
  changes: readonly ModelPricingRateChange[],
  marginMultiplier?: number,
): RateChangeBelowCost[] {
  return changes.flatMap((change) => {
    if (
      change.oldPriceUsd === null ||
      change.newPriceUsd === null ||
      !(change.oldPriceUsd > 0)
    )
      return [];
    const sellPriceUsd = sellPriceUsdForProviderCost(
      change.oldPriceUsd,
      marginMultiplier,
    );
    return change.newPriceUsd > sellPriceUsd ? [{ change, sellPriceUsd }] : [];
  });
}
