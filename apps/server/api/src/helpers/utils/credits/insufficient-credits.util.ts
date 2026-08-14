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
