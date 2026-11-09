import { BusinessLogicException } from '@api/exceptions/business-logic.exception';

/**
 * The ledger refused a payment key that another payment already holds. For a
 * server-derived key, that means the reader paid for the same thing from
 * another of their workspaces at the same moment.
 */
export function isPaymentKeyTaken(error: unknown): boolean {
  return (
    error instanceof BusinessLogicException &&
    error.errorCode === 'CREDIT_TRANSFER_KEY_REUSED'
  );
}
