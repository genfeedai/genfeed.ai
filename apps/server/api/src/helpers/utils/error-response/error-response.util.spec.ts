import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ErrorCode } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ErrorResponse util', () => {
  it('create builds a standardized payload', () => {
    const err = ErrorResponse.create({
      code: ErrorCode.VALIDATION_FAILED,
      detail: 'Missing field',
      meta: { field: 'name' },
      status: HttpStatus.BAD_REQUEST,
      title: 'Validation failed',
      validationErrors: [{ field: 'name', message: 'Required' }],
    });

    expect(err.status).toBe(HttpStatus.BAD_REQUEST);
    expect(err.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(err.title).toBe('Validation failed');
    expect(typeof err.timestamp).toBe('string');
    expect(typeof err.requestId).toBe('string');
    expect(err.meta).toEqual({ field: 'name' });
    expect(err.validationErrors?.[0]).toEqual({
      field: 'name',
      message: 'Required',
    });
  });

  it('throw raises HttpException with payload', () => {
    expect(() =>
      ErrorResponse.throw({
        code: ErrorCode.CONFLICT,
        detail: 'Already exists',
        status: HttpStatus.CONFLICT,
        title: 'Conflict',
      }),
    ).toThrow(HttpException);

    try {
      ErrorResponse.throw({
        code: ErrorCode.CONFLICT,
        detail: 'Already exists',
        status: HttpStatus.CONFLICT,
        title: 'Conflict',
      });
    } catch (ex: unknown) {
      expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
      const response = ex.getResponse();
      expect(response.title).toBe('Conflict');
      expect(response.detail).toBe('Already exists');
    }
  });

  it('common helpers throw expected HttpExceptions', () => {
    expect(() => ErrorResponse.unauthorized()).toThrow(HttpException);
    expect(() => ErrorResponse.forbidden()).toThrow(HttpException);
    expect(() => ErrorResponse.internalError()).toThrow(HttpException);
  });
});
