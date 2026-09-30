import type {
  ProviderCostQuote,
  ProviderQuoteDimensions,
  ReviewedProviderPricing,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';

import {
  ceilDecimalPricingRatio,
  multiplyDecimalPricing,
  sumDecimalPricing,
} from './decimal-pricing';
import { applyMargin } from './plans-pricing';

function validQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function unitsForRate(
  rate: ReviewedProviderRate,
  input: ProviderQuoteDimensions,
): number | null {
  switch (rate.unit) {
    case 'request':
      return input.requests ?? 1;
    case 'output':
      return input.outputs ?? 1;
    case 'second':
      return input.duration ?? null;
    case 'input-second':
      return input.inputDuration ?? null;
    case 'megapixel':
      return validQuantity(input.width) &&
        input.width > 0 &&
        validQuantity(input.height) &&
        input.height > 0
        ? multiplyDecimalPricing(input.width, input.height, 0.000001)
        : null;
    case 'input-megapixel':
      return input.inputMegapixels ?? null;
    case 'frame':
      return input.frames ?? null;
    case 'input-token':
      return input.inputTokens ?? null;
    case 'output-token':
      return input.outputTokens ?? null;
    case 'character':
      return input.characters ?? null;
    case 'reference':
      return input.references ?? null;
    default:
      return null;
  }
}

/** Only explicit reviewed rate bands can price a request; no default tiers. */
export function quoteReviewedProviderPricing(
  pricing: ReviewedProviderPricing,
  input: ProviderQuoteDimensions,
  marginMultiplier: number,
): ProviderCostQuote {
  const unresolved = (reason: string): ProviderCostQuote => ({
    status: 'unresolved',
    reason,
  });
  if (
    pricing.currency !== 'USD' ||
    pricing.reviewStatus !== 'approved' ||
    !/^https:\/\//.test(pricing.sourceUrl) ||
    !Number.isFinite(Date.parse(pricing.verifiedAt))
  ) {
    return unresolved(
      'Provider currency, dated source, or approval is unavailable',
    );
  }
  if (!Number.isFinite(marginMultiplier) || marginMultiplier <= 0) {
    return unresolved('Configured conversion policy is unavailable');
  }
  const outputs = input.outputs ?? 1;
  if (
    !Number.isSafeInteger(outputs) ||
    outputs < 1 ||
    pricing.rates.length === 0
  ) {
    return unresolved('Output count or provider rates are unavailable');
  }
  const components = new Map<string, ReviewedProviderRate[]>();
  for (const rate of pricing.rates) {
    if (
      !rate.component ||
      !validQuantity(rate.unitPriceUsd) ||
      (rate.unitPriceUsd === 0 && !pricing.isFree)
    ) {
      return unresolved('Missing or invalid provider rate');
    }
    components.set(rate.component, [
      ...(components.get(rate.component) ?? []),
      rate,
    ]);
  }
  const componentCosts: number[] = [];
  for (const [component, rates] of components) {
    const matches = rates.filter((rate) =>
      Object.entries(rate.when).every(
        ([key, value]) => input.selectors?.[key] === value,
      ),
    );
    if (matches.length !== 1)
      return unresolved(`Unpriced or ambiguous variant: ${component}`);
    const rate = matches[0];
    if (!rate) return unresolved(`Missing rate: ${component}`);
    const units = unitsForRate(rate, input);
    const included = rate.includedUnits ?? 0;
    const minimum = rate.minimumUnits ?? 0;
    const step = rate.roundUnitsTo ?? 0;
    if (
      !validQuantity(units) ||
      !validQuantity(included) ||
      !validQuantity(minimum) ||
      !validQuantity(step) ||
      (['second', 'megapixel', 'output', 'frame', 'request'].includes(
        rate.unit,
      ) &&
        units <= 0) ||
      ([
        'output',
        'request',
        'frame',
        'input-token',
        'output-token',
        'character',
        'reference',
      ].includes(rate.unit) &&
        !Number.isSafeInteger(units)) ||
      (['output', 'request'].includes(rate.unit) && rate.isPerOutput)
    ) {
      return unresolved(`Missing or invalid billed quantity: ${component}`);
    }
    let billedUnits = Math.max(
      minimum,
      sumDecimalPricing([units, -included]),
      0,
    );
    if (step > 0)
      billedUnits = multiplyDecimalPricing(
        ceilDecimalPricingRatio([billedUnits], step),
        step,
      );
    componentCosts.push(
      multiplyDecimalPricing(
        billedUnits,
        rate.unitPriceUsd,
        rate.isPerOutput ? outputs : 1,
      ),
    );
  }
  const providerCostUsd = sumDecimalPricing(componentCosts);
  if (!Number.isFinite(providerCostUsd))
    return unresolved('Provider cost is outside supported precision');
  return {
    status: 'priced',
    providerCostUsd,
    credits:
      providerCostUsd === 0
        ? 0
        : applyMargin(providerCostUsd, marginMultiplier),
  };
}
