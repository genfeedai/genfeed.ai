import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { HttpException, HttpStatus } from '@nestjs/common';

export function createInsufficientCreditsException(
  requiredCredits: number,
  balance: number,
): HttpException {
  const detail = `Insufficient credits: ${requiredCredits} required, ${balance} available`;
  const exception = new HttpException(
    {
      detail,
      title: 'Insufficient credits',
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
  // An object body leaves `Error.message` as "Http Exception", which is all a
  // log line or an agent tool failure showed for a refused generation.
  exception.message = detail;
  return exception;
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
