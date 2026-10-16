import type {
  ProviderBillingUnit,
  ReviewedProviderPricing,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { NormalizedFalPrice } from '@workers/crons/fal-model-watcher/fal-pricing';

/**
 * What fal's pricing API can confirm about a rate-sheet contract. The API states
 * one base unit price per endpoint, so it confirms a sheet when that price is
 * one of the sheet's rates in the same unit. Opaque units (`units`, `compute
 * seconds`, `processed megapixels`) cannot confirm anything.
 */
export type FalRateSheetObservation =
  | { status: 'not-rate-sheet' }
  | { status: 'unverifiable'; reason: string }
  | { status: 'confirmed' }
  | { status: 'changed'; pricing: ReviewedProviderPricing };

const FAL_UNITS: Readonly<
  Record<
    string,
    { isPerOutput?: boolean; scale: number; unit: ProviderBillingUnit }
  >
> = {
  audio: { scale: 1, unit: 'output' },
  audios: { scale: 1, unit: 'output' },
  image: { scale: 1, unit: 'output' },
  images: { scale: 1, unit: 'output' },
  megapixel: { isPerOutput: true, scale: 1, unit: 'megapixel' },
  megapixels: { isPerOutput: true, scale: 1, unit: 'megapixel' },
  minute: { isPerOutput: true, scale: 1 / 60, unit: 'second' },
  minutes: { isPerOutput: true, scale: 1 / 60, unit: 'second' },
  request: { scale: 1, unit: 'request' },
  requests: { scale: 1, unit: 'request' },
  second: { isPerOutput: true, scale: 1, unit: 'second' },
  seconds: { isPerOutput: true, scale: 1, unit: 'second' },
};

const PRICE_TOLERANCE_USD = 1e-9;

/** A contract the reviewed rate sheet wrote, as opposed to a fal snapshot. */
function isRateSheetPricing(pricing: unknown): boolean {
  return isRecord(pricing) && pricing.source === 'provider-model-page';
}

export function observeFalRateSheet(
  reviewedContractPricing: unknown,
  reviewed: ReviewedProviderPricing,
  prices: readonly NormalizedFalPrice[],
): FalRateSheetObservation {
  if (!isRateSheetPricing(reviewedContractPricing))
    return { status: 'not-rate-sheet' };
  const [price] = prices;
  if (prices.length !== 1 || !price)
    return {
      reason: 'fal states no single base price',
      status: 'unverifiable',
    };
  if (price.currency.toUpperCase() !== 'USD')
    return { reason: `currency ${price.currency}`, status: 'unverifiable' };
  if (Object.keys(price.conditionalDimensions).length > 0)
    return { reason: 'conditional base price', status: 'unverifiable' };
  const mapped = FAL_UNITS[price.unit.trim().toLowerCase()];
  const amount = Number(price.unitPrice);
  if (!mapped || !Number.isFinite(amount))
    return { reason: `opaque unit ${price.unit}`, status: 'unverifiable' };
  const unitPriceUsd = amount * mapped.scale;
  if (
    reviewed.rates.some(
      (rate) =>
        rate.unit === mapped.unit &&
        Math.abs(rate.unitPriceUsd - unitPriceUsd) < PRICE_TOLERANCE_USD,
    )
  )
    return { status: 'confirmed' };
  const observed: ReviewedProviderRate = {
    component: 'output',
    unit: mapped.unit,
    unitPriceUsd,
    when: {},
    ...(mapped.isPerOutput ? { isPerOutput: true } : {}),
  };
  const { variantRules: _variantRules, ...sheet } = reviewed;
  return { pricing: { ...sheet, rates: [observed] }, status: 'changed' };
}
