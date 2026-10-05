import type {
  ReviewedProviderRate,
  ReviewedVariantRule,
} from '@genfeedai/contracts/interfaces';

/**
 * One model's public provider list prices, keyed by `provider` + `endpoint`.
 * Public list prices only: no margin, account discount or commercial policy
 * lives here (the configured generation margin applies at quote time). A
 * public price counts as approved evidence because an account discount can
 * only make it conservative.
 */
export interface ReviewedRateSheetEntry {
  /** Registry provider, for example `replicate` or `fal`. */
  provider: string;
  /** The registry row's provider endpoint. */
  endpoint: string;
  /** Public page the prices were read from. */
  sourceUrl: string;
  /** When the prices were last read from `sourceUrl` (ISO date). */
  verifiedAt: string;
  rates: ReviewedProviderRate[];
  variantRules?: ReviewedVariantRule[];
  /**
   * Schema selectors that never change the price. When omitted, the seed
   * derives them from the model's input schema.
   */
  invariantSelectors?: string[];
}
