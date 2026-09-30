import type { ActivitySource, ByokProvider } from '../..';
import type { ModelBillableQuoteSnapshot } from '../billing/model-pricing.interface';

/**
 * Pricing facts in force when a generation charge was computed. Stamped into
 * `CreditTransaction.metadata` so every charge can be reconstructed after a
 * margin or provider-cost change (see
 * PlatformSetting.marginMultiplierGeneration). Agent chat bills from its own
 * separate multiplier (PlatformSetting.marginMultiplierAgentChat) and does
 * not use this metadata shape.
 */
export interface CreditsPricingMetadata {
  /** Runtime generation sell/cost ratio applied to provider USD (3.33 = 70% margin). */
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
  /**
   * The request body's `model` names the content's target model (for example
   * the generation model a prompt is written for), not what this route bills.
   * Pricing then comes from `amount` / `modelKey` alone.
   */
  isBodyModelIgnored?: boolean;
  /** Boolean request-body attribute that makes this route non-billable. */
  skipWhenBodyAttribute?: string;
  source?: ActivitySource;
  provider?: ByokProvider;
  isByokBypass?: boolean;
  pricingMetadata?: CreditsPricingMetadata;
  /** Internal frozen quote; exclude from response serializers. */
  modelQuote?: ModelBillableQuoteSnapshot;
  /**
   * Opt in only — billing fails safe (#5294). CreditsGuard resolves a BYOK
   * provider and bypasses credits ONLY when this is explicitly `true`. Set
   * it only after verifying the route's provider dispatch actually receives
   * the org's resolved key (directly, or via `creditsConfig.provider` /
   * `creditsConfig.isByokBypass` read downstream, e.g. batch interpolation).
   * A new `@Credits({ modelKey })` route defaults to charging credits
   * normally, even when the org has an active key for the resolved
   * provider — the platform key pays regardless, so that default is safe.
   */
  allowByokBypass?: boolean;
  /**
   * The org's decrypted BYOK key, resolved exactly once by CreditsGuard in
   * the same call that decides `isByokBypass` (#5375). Dispatch reads this
   * instead of re-resolving, so the credit decision and the key used to pay
   * for the call can never disagree.
   */
  byokApiKeyOverride?: string;
  /**
   * The caller reserves and settles per unit of work itself (a background job
   * that bills each completed item), so admission checks the balance without
   * placing a request-level hold.
   */
  isReservationDeferred?: boolean;
  /**
   * `completion`: the route starts async media work, so the guard's hold is not
   * settled on the HTTP response. The service binds each accepted output to its
   * own hold (`GenerationBillingService.bindOutput`) and the completion path
   * settles or releases it (#5657). Omit for synchronous work, which settles
   * on response.
   */
  settlement?: 'completion';
  /** Runtime: how many accepted outputs the service has bound to a hold. */
  boundOutputCount?: number;
  /**
   * Runtime: the service binds further outputs after the response returns and
   * releases the request hold itself when it is done, so the interceptor must
   * leave the hold open.
   */
  isPoolReleaseDeferred?: boolean;
}
