import {
  BusinessLogicException,
  InsufficientCreditsException,
} from '@api/exceptions/business-logic.exception';
import { HttpException, HttpStatus } from '@nestjs/common';

import {
  createInsufficientCreditsException,
  rethrowReservationFailure,
} from './insufficient-credits.util';

describe('createInsufficientCreditsException', () => {
  it('returns 402 with the required and available amounts', () => {
    const error = createInsufficientCreditsException(40, 12);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toEqual({
      detail: 'Insufficient credits: 40 required, 12 available',
      title: 'Insufficient credits',
    });
  });
});

describe('rethrowReservationFailure', () => {
  it('turns a ledger shortfall into a 402 carrying the current balance', async () => {
    const failure = rethrowReservationFailure(
      new InsufficientCreditsException(40, 0),
      40,
      async () => 7,
    );

    await expect(failure).rejects.toMatchObject({
      response: {
        detail: 'Insufficient credits: 40 required, 7 available',
        title: 'Insufficient credits',
      },
      status: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('rethrows any other error unchanged', async () => {
    const error = new BusinessLogicException('Locked', {}, 'LOCKED');

    await expect(
      rethrowReservationFailure(error, 40, async () => 7),
    ).rejects.toBe(error);
  });
});
