import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import { getSubscriptionPreviewFailureDiagnostics } from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import type { ISubscriptionPreviewFailureError } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';

/**
 * Writes a classified preview failure as one JSON:API error member that keeps
 * the public `code` and retry `meta` (the global HttpExceptionFilter drops
 * both). Retryable failures also advertise `Retry-After`. Only unclassified
 * faults (5xx that are not a provider outage) page error tracking; everything
 * else is expected client or provider state and is logged with safe
 * diagnostics.
 */
@Catch(SubscriptionPreviewException)
export class SubscriptionPreviewExceptionFilter
  implements ExceptionFilter<SubscriptionPreviewException>
{
  private readonly sentryEnvironment: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.sentryEnvironment = this.configService.get('SENTRY_ENVIRONMENT') ?? '';
  }

  catch(exception: SubscriptionPreviewException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const diagnostics = getSubscriptionPreviewFailureDiagnostics(exception);

    const isFault =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && !exception.isRetryable;
    if (isFault) {
      this.loggerService.error(
        'Subscription preview failed with an unclassified fault',
        undefined,
        diagnostics,
      );
      if (this.sentryEnvironment !== 'development') {
        Sentry.captureException(exception, { extra: diagnostics });
      }
    } else {
      this.loggerService.warn('Subscription preview rejected', diagnostics);
    }

    if (exception.meta.retryAfterSeconds !== null) {
      response.setHeader(
        'Retry-After',
        String(exception.meta.retryAfterSeconds),
      );
    }

    const error: ISubscriptionPreviewFailureError = {
      code: exception.code,
      detail: exception.message,
      meta: exception.meta,
      status: String(status),
      title: 'Subscription preview failed',
    };
    response.status(status).json({ errors: [error] });
  }
}
