import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import { describe, expect, it } from 'vitest';

function metaOf(error: ExternalServiceException) {
  return (
    error.getResponse() as {
      meta?: { originalError: string; statusCode: number | undefined };
    }
  ).meta;
}

describe('ExternalServiceException', () => {
  it('normalizes primitive original errors', () => {
    expect(metaOf(new ExternalServiceException('S3', 'fail', 404))).toEqual({
      originalError: '404',
      statusCode: undefined,
    });
    expect(metaOf(new ExternalServiceException('S3', 'fail', true))).toEqual({
      originalError: 'true',
      statusCode: undefined,
    });
    expect(metaOf(new ExternalServiceException('S3', 'fail', 10n))).toEqual({
      originalError: '10',
      statusCode: undefined,
    });
    expect(
      metaOf(new ExternalServiceException('S3', 'fail', Symbol('x'))),
    ).toEqual({
      originalError: 'Unknown error type',
      statusCode: undefined,
    });
  });

  it('stringifies object errors and drops empty messages without a status', () => {
    expect(
      metaOf(
        new ExternalServiceException('Stripe', 'charge', {
          message: { nested: true },
        }),
      ),
    ).toEqual({
      originalError: '{"message":{"nested":true}}',
      statusCode: undefined,
    });
    expect(
      metaOf(
        new ExternalServiceException('Stripe', 'charge', {
          message: '',
        }),
      ),
    ).toBeUndefined();
    expect(
      metaOf(
        new ExternalServiceException('Stripe', 'charge', {
          message: '',
          statusCode: 502,
        }),
      ),
    ).toEqual({
      originalError: '',
      statusCode: 502,
    });
  });
});
