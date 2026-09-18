import type { ByokProvider } from '@genfeedai/contracts';
import type { CreditsPricingMetadata } from '@genfeedai/contracts/interfaces';

/**
 * Deferred-credit request plumbing. The pricing arithmetic itself lives in
 * `@genfeedai/pricing` (`calculateImageGenerationCredits` /
 * `calculateVideoGenerationCredits`) so quotes and charges share one contract.
 */

export type DeferredCreditsConfig = {
  amount?: number;
  deferred?: boolean;
  isByokBypass?: boolean;
  modelKey?: string;
  pricingMetadata?: CreditsPricingMetadata;
  provider?: ByokProvider;
  reservationId?: string;
};

export type DeferredCreditsRequest = {
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
