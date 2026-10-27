import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { finalizeDeferredTextCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import type { Request } from 'express';

interface BrandedTextCreditOutcome {
  brandedReceipt: { isReplayed: boolean };
  model?: string;
}

/**
 * Settles the deferred text charge of a receipt-backed generation. A fresh
 * dispatch is charged. A replay answers from the saved receipt and is not. A
 * request that stopped after the provider was already called still owes that
 * known cost, so it is finalized before the failure propagates; a stop before
 * any provider attempt stays deferred and its reservation is released.
 *
 * A request can make more than one paid provider call (the over-limit retry).
 * `generate` receives a callback to report each one it made; each is charged
 * the model minimum, and without a report one call is assumed.
 */
export async function finalizeBrandedTextCredits<
  T extends BrandedTextCreditOutcome,
>(
  request: Request,
  minimumCredits: (model: string | undefined) => Promise<number>,
  generate: (onProviderDispatch: () => void) => Promise<T>,
): Promise<T> {
  let reportedCalls = 0;
  let result: T;
  try {
    result = await generate(() => {
      reportedCalls += 1;
    });
  } catch (error: unknown) {
    if (error instanceof BrandedGenerationBlockedException) {
      const paidCalls = Math.max(reportedCalls, error.providerAttempt ? 1 : 0);
      if (paidCalls > 0)
        finalizeDeferredTextCredits(
          request,
          (await minimumCredits(error.providerAttempt?.model)) * paidCalls,
        );
    }
    throw error;
  }
  if (!result.brandedReceipt.isReplayed)
    finalizeDeferredTextCredits(
      request,
      (await minimumCredits(result.model)) * Math.max(1, reportedCalls),
    );
  return result;
}
