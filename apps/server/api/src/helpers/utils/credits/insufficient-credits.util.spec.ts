import { HttpException, HttpStatus } from '@nestjs/common';

import { createInsufficientCreditsException } from './insufficient-credits.util';

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
