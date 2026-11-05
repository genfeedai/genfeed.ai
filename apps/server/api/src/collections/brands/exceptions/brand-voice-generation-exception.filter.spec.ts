import { BrandVoiceGenerationException } from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import { BrandVoiceGenerationExceptionFilter } from '@api/collections/brands/exceptions/brand-voice-generation-exception.filter';
import { BrandVoiceFailureCode } from '@genfeedai/contracts/interfaces';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

interface SentError {
  code: string;
  detail: string;
  meta: { isRetryable: boolean };
  status: string;
  title: string;
}

/** Runs the filter against a response that keeps what was written to it. */
function send(exception: BrandVoiceGenerationException) {
  const sent: { body?: { errors: SentError[] }; status?: number } = {};
  const response = {
    json: (body: { errors: SentError[] }) => {
      sent.body = body;
    },
    status: (status: number) => {
      sent.status = status;
      return response;
    },
  };
  new BrandVoiceGenerationExceptionFilter().catch(exception, {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost);
  return sent;
}

describe('BrandVoiceGenerationExceptionFilter', () => {
  it('writes one JSON:API member keeping the public code and meta', () => {
    const sent = send(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
        missingFields: ['style'],
        outputLength: 64,
      }),
    );

    expect(sent.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sent.body?.errors).toHaveLength(1);
    expect(sent.body?.errors[0]).toMatchObject({
      code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
      meta: { isRetryable: true },
      status: '422',
      title: 'Brand voice generation failed',
    });
    expect(sent.body?.errors[0]?.detail).toContain('missing style');
  });

  it('answers a rejected input with its own status and no retry hint', () => {
    const sent = send(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.SOURCE_REQUIRED,
      }),
    );

    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body?.errors[0]).toMatchObject({
      code: BrandVoiceFailureCode.SOURCE_REQUIRED,
      meta: { isRetryable: false },
      status: '400',
    });
  });

  it('never serializes the redacted diagnostics', () => {
    const sent = send(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
        outputLength: 2048,
      }),
    );

    expect(JSON.stringify(sent.body)).not.toContain('outputLength');
    expect(JSON.stringify(sent.body)).not.toContain('2048');
  });
});
