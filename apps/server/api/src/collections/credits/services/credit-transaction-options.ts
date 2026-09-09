import type { IAddCreditsOptions } from '@genfeedai/contracts/interfaces/billing';

const CREDIT_TRANSACTION_OPTION_KEYS = [
  'actorUserId',
  'idempotencyKey',
  'metadata',
  'referenceId',
  'referenceType',
] as const satisfies ReadonlyArray<keyof IAddCreditsOptions>;

/**
 * Keeps only the transaction options a caller actually supplied, and returns
 * `undefined` when none were, so the ledger write is untouched for callers that
 * pass no options.
 */
export function creditTransactionOptions(
  options: IAddCreditsOptions | undefined,
): Partial<IAddCreditsOptions> | undefined {
  if (!options) {
    return undefined;
  }

  const supplied: Partial<IAddCreditsOptions> = {};
  for (const key of CREDIT_TRANSACTION_OPTION_KEYS) {
    const value = options[key];
    if (value) {
      Object.assign(supplied, { [key]: value });
    }
  }

  return Object.keys(supplied).length > 0 ? supplied : undefined;
}
