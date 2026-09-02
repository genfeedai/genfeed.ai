import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import type { Request } from 'express';

type DeferredCreditsConfig = CreditsConfig & {
  deferred?: boolean;
  maxOverdraftCredits?: number;
};

type DeferredCreditsRequest = Request & {
  creditsConfig?: DeferredCreditsConfig;
};

export const TEXT_MAX_OVERDRAFT_CREDITS = 5;

export function finalizeDeferredTextCredits(
  request: Request,
  amount: number,
): void {
  const creditsRequest = request as DeferredCreditsRequest;

  if (!creditsRequest.creditsConfig?.deferred) {
    return;
  }

  creditsRequest.creditsConfig = {
    ...creditsRequest.creditsConfig,
    amount,
    deferred: false,
    maxOverdraftCredits: TEXT_MAX_OVERDRAFT_CREDITS,
  };
}

/**
 * Reconciles a preflighted multi-output charge to the usable outputs that were
 * actually persisted. The final amount can only be lower than the amount the
 * guard checked for the request.
 */
export function finalizeOutputCredits(request: Request, amount: number): void {
  const creditsRequest = request as DeferredCreditsRequest;
  if (!creditsRequest.creditsConfig) return;

  creditsRequest.creditsConfig = {
    ...creditsRequest.creditsConfig,
    amount,
    deferred: false,
  };
}
