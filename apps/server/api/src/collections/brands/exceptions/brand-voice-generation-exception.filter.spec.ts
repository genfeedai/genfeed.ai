import { BrandVoiceGenerationException } from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import { BrandVoiceGenerationExceptionFilter } from '@api/collections/brands/exceptions/brand-voice-generation-exception.filter';
import { BrandVoiceFailureCode } from '@genfeedai/contracts/interfaces';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

describe('BrandVoiceGenerationExceptionFilter', () => {
  let json: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let host: ArgumentsHost;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
  });

  it('writes one JSON:API member keeping the public code and meta', () => {
    new BrandVoiceGenerationExceptionFilter().catch(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
        missingFields: ['style'],
        outputLength: 64,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(json).toHaveBeenCalledWith({
      errors: [
        {
          code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
          detail: expect.stringContaining('missing style'),
          meta: { isRetryable: true },
          status: '422',
          title: 'Brand voice generation failed',
        },
      ],
    });
  });

  it('answers a rejected input with its own status and no retry hint', () => {
    new BrandVoiceGenerationExceptionFilter().catch(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.SOURCE_REQUIRED,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      errors: [
        expect.objectContaining({
          code: BrandVoiceFailureCode.SOURCE_REQUIRED,
          meta: { isRetryable: false },
          status: '400',
        }),
      ],
    });
  });

  it('never serializes the redacted diagnostics', () => {
    new BrandVoiceGenerationExceptionFilter().catch(
      new BrandVoiceGenerationException({
        code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
        outputLength: 2048,
      }),
      host,
    );

    const [body] = json.mock.calls[0] as [{ errors: Array<object> }];
    expect(JSON.stringify(body)).not.toContain('outputLength');
    expect(JSON.stringify(body)).not.toContain('2048');
  });
});
