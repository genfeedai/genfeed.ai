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
 */
export async function finalizeBrandedTextCredits<
  T extends BrandedTextCreditOutcome,
>(
  request: Request,
  minimumCredits: (model: string | undefined) => Promise<number>,
  generate: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await generate();
  } catch (error: unknown) {
    if (
      error instanceof BrandedGenerationBlockedException &&
      error.providerAttempt
    )
      finalizeDeferredTextCredits(
        request,
        await minimumCredits(error.providerAttempt.model),
      );
    throw error;
  }
  if (!result.brandedReceipt.isReplayed)
    finalizeDeferredTextCredits(request, await minimumCredits(result.model));
  return result;
}
