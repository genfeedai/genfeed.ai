import {
  BRAND_VOICE_FAILURE_TITLE,
  BrandVoiceGenerationException,
} from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import { BrandVoiceFailureCode } from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('BrandVoiceGenerationException', () => {
  it('is a NestJS exception carrying the public code and title', () => {
    const exception = new BrandVoiceGenerationException({
      code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
    });

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.name).toBe('BrandVoiceGenerationException');
    expect(exception.code).toBe(BrandVoiceFailureCode.MALFORMED_OUTPUT);
    expect(exception.getResponse()).toMatchObject({
      code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
      title: BRAND_VOICE_FAILURE_TITLE,
    });
  });

  it.each([
    [BrandVoiceFailureCode.EMPTY_OUTPUT, HttpStatus.UNPROCESSABLE_ENTITY],
    [BrandVoiceFailureCode.INCOMPLETE_PROFILE, HttpStatus.UNPROCESSABLE_ENTITY],
    [BrandVoiceFailureCode.MALFORMED_OUTPUT, HttpStatus.UNPROCESSABLE_ENTITY],
    [
      BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE,
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
    [BrandVoiceFailureCode.BRAND_NOT_FOUND, HttpStatus.BAD_REQUEST],
    [BrandVoiceFailureCode.SOURCE_REQUIRED, HttpStatus.BAD_REQUEST],
    [BrandVoiceFailureCode.SOURCE_URL_INVALID, HttpStatus.BAD_REQUEST],
  ])('answers %s with status %i', (code, status) => {
    expect(new BrandVoiceGenerationException({ code }).getStatus()).toBe(
      status,
    );
  });

  it.each([
    [BrandVoiceFailureCode.EMPTY_OUTPUT, true],
    [BrandVoiceFailureCode.INCOMPLETE_PROFILE, true],
    [BrandVoiceFailureCode.MALFORMED_OUTPUT, true],
    [BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE, true],
    [BrandVoiceFailureCode.BRAND_NOT_FOUND, false],
    [BrandVoiceFailureCode.SOURCE_REQUIRED, false],
    [BrandVoiceFailureCode.SOURCE_URL_INVALID, false],
  ])('flags %s as retryable=%s', (code, isRetryable) => {
    const exception = new BrandVoiceGenerationException({ code });

    expect(exception.isRetryable).toBe(isRetryable);
    expect(exception.meta).toEqual({ isRetryable });
    expect(exception.getResponse()).toMatchObject({ meta: { isRetryable } });
  });

  it('names the missing fields in the detail of an incomplete profile', () => {
    const exception = new BrandVoiceGenerationException({
      code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
      missingFields: ['style', 'audience'],
    });

    expect(exception.message).toBe(
      'The generated brand profile is missing style, audience. Try again; adding a website URL, description, or target audience gives the model more to work with.',
    );
    expect(exception.getResponse()).toMatchObject({
      detail: exception.message,
    });
  });

  it.each([
    [BrandVoiceFailureCode.EMPTY_OUTPUT, 'returned an empty brand profile'],
    [BrandVoiceFailureCode.MALFORMED_OUTPUT, 'unreadable brand profile'],
    [BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE, 'unreadable brand profile'],
    [BrandVoiceFailureCode.BRAND_NOT_FOUND, 'Brand not found'],
    [BrandVoiceFailureCode.SOURCE_REQUIRED, 'url or brandId must be provided'],
    [BrandVoiceFailureCode.SOURCE_URL_INVALID, 'valid website URL'],
  ])('writes a default detail for %s', (code, expected) => {
    expect(new BrandVoiceGenerationException({ code }).message).toContain(
      expected,
    );
  });

  it('lets a caller override the detail with something sharper', () => {
    const exception = new BrandVoiceGenerationException({
      code: BrandVoiceFailureCode.SOURCE_URL_INVALID,
      detail: 'Private network addresses are not allowed',
    });

    expect(exception.message).toBe('Private network addresses are not allowed');
  });

  it('keeps diagnostics to the shape of the output, never its content', () => {
    const exception = new BrandVoiceGenerationException({
      code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
      missingFields: ['tone'],
      outputLength: 128,
    });

    expect(exception.diagnostics).toEqual({
      code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
      isRetryable: true,
      missingFields: ['tone'],
      outputLength: 128,
    });
    // Diagnostics are for logs only and must never ride along in the response.
    expect(exception.getResponse()).not.toHaveProperty('diagnostics');
    expect(exception.getResponse()).not.toHaveProperty('meta.outputLength');
  });

  it('defaults diagnostics when a cause carries no model output', () => {
    expect(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.SOURCE_REQUIRED,
      }).diagnostics,
    ).toEqual({
      code: BrandVoiceFailureCode.SOURCE_REQUIRED,
      isRetryable: false,
      missingFields: [],
      outputLength: 0,
    });
  });
});
