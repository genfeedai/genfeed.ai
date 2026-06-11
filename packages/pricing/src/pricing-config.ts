/**
 * Pricing configuration.
 *
 * Margin and credit costs are configurable via admin UI (stored in DB)
 * with env var fallbacks for self-hosters.
 */
export interface PricingConfig {
  /** Base cost per credit (GPU compute cost) */
  baseCostPerCredit: number;
  /** Margin multiplier — 1.0 = no markup, 2.0 = 100% margin */
  marginMultiplier: number;
}

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
