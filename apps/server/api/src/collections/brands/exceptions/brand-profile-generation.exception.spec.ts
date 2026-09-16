import {
  BRAND_PROFILE_GENERATION_INVALID_CODE,
  BrandProfileGenerationException,
} from '@api/collections/brands/exceptions/brand-profile-generation.exception';
import { BrandProfileGenerationFailureReason } from '@genfeedai/contracts';
import type { IBrandProfileGenerationDiagnostics } from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

function buildDiagnostics(
  overrides: Partial<IBrandProfileGenerationDiagnostics> = {},
): IBrandProfileGenerationDiagnostics {
  return {
    isRetryable: true,
    missingFields: [],
    outputLength: 42,
    reason: BrandProfileGenerationFailureReason.MALFORMED_JSON,
    ...overrides,
  };
}

describe('BrandProfileGenerationException', () => {
  it('is a NestJS 422 with a stable classified code', () => {
    const exception = new BrandProfileGenerationException(buildDiagnostics());

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.name).toBe('BrandProfileGenerationException');
    expect(exception.getResponse()).toMatchObject({
      code: BRAND_PROFILE_GENERATION_INVALID_CODE,
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      title: 'Brand profile generation failed',
    });
  });

  it('carries the redacted diagnostics as meta and on the instance', () => {
    const diagnostics = buildDiagnostics({
      missingFields: ['style', 'audience'],
      reason: BrandProfileGenerationFailureReason.MISSING_REQUIRED_FIELDS,
    });
    const exception = new BrandProfileGenerationException(diagnostics);

    expect(exception.diagnostics).toEqual(diagnostics);
    expect(exception.getResponse()).toMatchObject({ meta: diagnostics });
  });

  it.each([
    [
      BrandProfileGenerationFailureReason.EMPTY_OUTPUT,
      [],
      'The model returned an empty brand profile.',
    ],
    [
      BrandProfileGenerationFailureReason.MALFORMED_JSON,
      [],
      'The model returned an unreadable brand profile.',
    ],
    [
      BrandProfileGenerationFailureReason.NOT_AN_OBJECT,
      [],
      'The model returned an unreadable brand profile.',
    ],
    [
      BrandProfileGenerationFailureReason.MISSING_REQUIRED_FIELDS,
      ['tone', 'topics'],
      'The generated brand profile is missing tone, topics.',
    ],
  ])(
    'writes an actionable detail for %s',
    (reason, missingFields, expectedPrefix) => {
      const exception = new BrandProfileGenerationException(
        buildDiagnostics({ missingFields, reason }),
      );
      const response = exception.getResponse() as { detail: string };

      expect(response.detail.startsWith(expectedPrefix)).toBe(true);
      expect(response.detail).toContain('Try again');
      expect(exception.message).toBe(response.detail);
    },
  );
});
