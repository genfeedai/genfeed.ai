import { readHttpExceptionDetail } from '@api/helpers/utils/error-response/http-exception-detail.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('readHttpExceptionDetail', () => {
  it('reads the detail of an object body that Nest reports as "Http Exception"', () => {
    const error = new HttpException(
      { detail: 'Insufficient credits: 37 required, 0 available' },
      HttpStatus.PAYMENT_REQUIRED,
    );

    expect(error.message).toBe('Http Exception');
    expect(readHttpExceptionDetail(error)).toBe(
      'Insufficient credits: 37 required, 0 available',
    );
  });

  it('puts the title in front of a detail that does not repeat it', () => {
    const error = new HttpException(
      {
        detail: 'You do not have access to this brand',
        title: 'Brand not found',
      },
      HttpStatus.FORBIDDEN,
    );

    expect(readHttpExceptionDetail(error)).toBe(
      'Brand not found: You do not have access to this brand',
    );
  });

  it('falls back to the title, then joins a message list', () => {
    expect(
      readHttpExceptionDetail(
        new HttpException({ title: 'Forbidden' }, HttpStatus.FORBIDDEN),
      ),
    ).toBe('Forbidden');
    expect(
      readHttpExceptionDetail(
        new BadRequestException({ message: ['a is required', 'b is invalid'] }),
      ),
    ).toBe('a is required; b is invalid');
  });

  it('reads a string body and a plain error message', () => {
    expect(
      readHttpExceptionDetail(new HttpException('Nope', HttpStatus.CONFLICT)),
    ).toBe('Nope');
    expect(readHttpExceptionDetail(new Error('socket hang up'))).toBe(
      'socket hang up',
    );
    expect(readHttpExceptionDetail('boom')).toBe('boom');
  });

  it('returns nothing when the only text is the class name', () => {
    expect(
      readHttpExceptionDetail(new HttpException({}, HttpStatus.BAD_REQUEST)),
    ).toBeUndefined();
    expect(readHttpExceptionDetail(undefined)).toBeUndefined();
  });
});
