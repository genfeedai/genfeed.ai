import type { ByokProvider } from '@genfeedai/contracts';
import type {
  CreditsPricingMetadata,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';

/**
 * Deferred-credit request plumbing. The pricing arithmetic itself lives in
 * `@genfeedai/pricing` (`calculateImageGenerationCredits` /
 * `calculateVideoGenerationCredits`) so quotes and charges share one contract.
 */

export type ApprovedImageQuoteConstraint = {
  model: string;
  unitCredits: number;
  billingMode: 'credits' | 'byok';
  pricingHash: string;
};

/** Server-owned consent constraint, never accepted from generation bodies. */
export type ApprovedGenerationQuoteConstraint = ApprovedImageQuoteConstraint & {
  provider: string;
  maximumCredits: number;
  quantities: ModelBillableQuoteSnapshot['quantities'];
};

export type DeferredCreditsConfig = {
  approvedImageQuote?: ApprovedImageQuoteConstraint;
  approvedGenerationQuote?: ApprovedGenerationQuoteConstraint;
  amount?: number;
  /**
   * The org's own decrypted key for `provider`, resolved once alongside the
   * `isByokBypass` decision (#5294). Dispatch must reuse this exact value —
   * re-resolving separately would let the credit decision and the actual
   * provider call disagree about whose key pays.
   */
  byokApiKeyOverride?: string;
  byokApiSecretOverride?: string;
  deferred?: boolean;
  isByokBypass?: boolean;
  modelKey?: string;
  pricingMetadata?: CreditsPricingMetadata;
  modelQuote?: ModelBillableQuoteSnapshot;
  provider?: ByokProvider;
  reservationId?: string;
};

export type DeferredCreditsRequest = {
  approvedRemixQuoteId?: string;
  creditsConfig?: DeferredCreditsConfig;
};

export function isDeferredCreditsRequest(
  request: DeferredCreditsRequest,
): boolean {
  return Boolean(request.creditsConfig?.deferred);
}

export function commitDeferredCredits(
  request: DeferredCreditsRequest,
  amount: number,
  modelKey: string,
  pricingMetadata?: CreditsPricingMetadata,
): void {
  request.creditsConfig = {
    ...request.creditsConfig,
    amount,
    deferred: false,
    modelKey,
    ...(pricingMetadata ? { pricingMetadata } : {}),
  };
}
