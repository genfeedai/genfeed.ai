import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { HttpException, HttpStatus } from '@nestjs/common';

export function createInsufficientCreditsException(
  requiredCredits: number,
  balance: number,
): HttpException {
  return new HttpException(
    {
      detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
      title: 'Insufficient credits',
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

/**
 * Rethrow a failed credit reservation. The ledger's `INSUFFICIENT_CREDITS`
 * business error becomes the 402 response carrying the organization's current
 * balance; any other error is rethrown unchanged.
 */
export async function rethrowReservationFailure(
  error: unknown,
  requiredCredits: number,
  readBalance: () => Promise<number>,
): Promise<never> {
  if (
    error instanceof BusinessLogicException &&
    error.errorCode === 'INSUFFICIENT_CREDITS'
  ) {
    throw createInsufficientCreditsException(
      requiredCredits,
      await readBalance(),
    );
  }
  throw error;
}
