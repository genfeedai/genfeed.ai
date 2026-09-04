import type { ActivitySource, ByokProvider } from '../..';

/**
 * Pricing facts in force when a generation charge was computed. Stamped into
 * `CreditTransaction.metadata` so every charge can be reconstructed after a
 * margin or provider-cost change (see PlatformSetting.marginMultiplier).
 */
export interface CreditsPricingMetadata {
  /** Runtime margin multiplier applied on top of the base 70% margin. */
  marginMultiplier: number;
  /** Model pricing type (flat / per-second / per-megapixel) used to price. */
  pricingType: string | null;
  /** Raw provider cost in USD per unit; null when legacy credit columns priced the charge. */
  providerCostUsd: number | null;
}

/**
 * Configuration for the @Credits decorator.
 * Defines credit deduction parameters for API endpoints.
 */
export interface CreditsConfig {
  amount?: number;
  modelKey?: string;
  description: string;
  /** Boolean request-body attribute that makes this route non-billable. */
  skipWhenBodyAttribute?: string;
  source?: ActivitySource;
  provider?: ByokProvider;
  isByokBypass?: boolean;
  pricingMetadata?: CreditsPricingMetadata;
}
