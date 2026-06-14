import type { PricingConfig } from '@genfeedai/interfaces';

export type { PricingConfig };

export function getPricingConfig(): PricingConfig {
  return {
    baseCostPerCredit: parseFloat(
      process.env.GENFEED_BASE_COST_PER_CREDIT || '0.005',
    ),
    marginMultiplier: parseFloat(
      process.env.GENFEED_MARGIN_MULTIPLIER || '1.0',
    ),
  };
}
