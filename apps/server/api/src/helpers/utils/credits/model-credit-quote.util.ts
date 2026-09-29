import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { PricingType } from '@genfeedai/contracts';
import { billCreditsFromProviderCost } from '@genfeedai/pricing';

export interface ModelCreditQuoteRow {
  cost?: number | null;
  costPerUnit?: number | null;
  defaultDuration?: number | null;
  minCost?: number | null;
  pricingType?: string | null;
  providerCostUsd?: number | null;
}

export interface ModelCreditQuoteInput {
  duration?: number;
  height?: number;
  width?: number;
}

/**
 * The one price of a single output from a model row (#5657). The credits guard
 * reserves it, services quote it, and settlement charges exactly the reserved
 * amount, so the three can never disagree.
 *
 * Preferred: provider USD cost × live margin. Fallback: the legacy baked
 * `cost` / `costPerUnit` columns when `providerCostUsd` is null.
 */
export function quoteModelCredits(
  model: ModelCreditQuoteRow,
  input: ModelCreditQuoteInput = {},
): number {
  const { duration, height, width } = input;
  const liveCredits = billCreditsFromProviderCost(model, {
    duration,
    height,
    width,
  });
  if (liveCredits !== null) {
    return liveCredits;
  }

  const pricingType = model.pricingType || PricingType.FLAT;
  let baseCost = model.cost || 0;

  switch (pricingType) {
    case PricingType.PER_MEGAPIXEL: {
      if (width && height && model.costPerUnit) {
        const megapixels = (width * height) / 1_000_000;
        baseCost = Math.ceil(megapixels * model.costPerUnit);
      }
      break;
    }
    case PricingType.PER_SECOND: {
      if (duration && model.costPerUnit) {
        baseCost = Math.ceil(duration * model.costPerUnit);
      }
      break;
    }
    case 'per-token':
      baseCost = getMinimumTextCredits(model);
      break;
    default:
      break;
  }

  const minCost = model.minCost || 0;
  return minCost > 0 && baseCost < minCost ? minCost : baseCost;
}
