import type { PricingConfig } from '@genfeedai/interfaces';

export type { PricingConfig };

const DEFAULT_BASE_COST_PER_CREDIT = 0.005;
const DEFAULT_MARGIN_MULTIPLIER = 1.0;

function parseFiniteFloat(
  value: string | undefined,
  defaultValue: number,
): number {
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function getPricingConfig(): PricingConfig {
  return {
    baseCostPerCredit: parseFiniteFloat(
      process.env.GENFEED_BASE_COST_PER_CREDIT,
      DEFAULT_BASE_COST_PER_CREDIT,
    ),
    marginMultiplier: parseFiniteFloat(
      process.env.GENFEED_MARGIN_MULTIPLIER,
      DEFAULT_MARGIN_MULTIPLIER,
    ),
  };
}
