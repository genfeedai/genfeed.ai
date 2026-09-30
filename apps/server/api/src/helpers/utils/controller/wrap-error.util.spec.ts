import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('wrapError', () => {
  it('returns the resolved value', async () => {
    await expect(wrapError(async () => 42)).resolves.toBe(42);
  });

  it('rethrows HttpException unchanged', async () => {
    const error = new HttpException('Nope', HttpStatus.BAD_REQUEST);

    await expect(
      wrapError(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it('maps unknown errors to a 500 using the error message', async () => {
    const error = await wrapError(async () => {
      throw new Error('disk full');
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect((error as HttpException).message).toBe('disk full');
  });

  it('falls back to the supplied message when the thrown value has none', async () => {
    const error = await wrapError(async () => {
      throw 0;
    }, 'Operation failed').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect((error as HttpException).message).toBe('Operation failed');
  });
});
