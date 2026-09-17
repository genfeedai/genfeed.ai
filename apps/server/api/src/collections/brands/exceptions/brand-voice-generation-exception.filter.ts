import { BrandVoiceGenerationException } from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import type { IBrandVoiceFailureError } from '@genfeedai/contracts/interfaces';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Writes a classified brand voice failure as one JSON:API error member that
 * keeps the public `code` and the retry hint in `meta`; the global
 * `HttpExceptionFilter` drops both, which is why this route needs its own.
 *
 * Transport only. `BrandGenerationService` logs every one of these with the
 * brand and organization it happened for, so logging here would only duplicate
 * that with less context. Nothing reaches error tracking: every cause is
 * expected client or model state, which is the point of the classification.
 */
@Catch(BrandVoiceGenerationException)
export class BrandVoiceGenerationExceptionFilter
  implements ExceptionFilter<BrandVoiceGenerationException>
{
  catch(exception: BrandVoiceGenerationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();

    const error: IBrandVoiceFailureError = {
      code: exception.code,
      detail: exception.message,
      meta: exception.meta,
      status: String(status),
      title: exception.title,
    };

    response.status(status).json({ errors: [error] });
  }
}
