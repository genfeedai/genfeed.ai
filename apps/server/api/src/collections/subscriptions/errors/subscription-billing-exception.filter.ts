import { SubscriptionBillingException } from '@api/collections/subscriptions/errors/subscription-billing.exception';
import { buildSubscriptionFailureDiagnostics } from '@api/collections/subscriptions/errors/subscription-failure-diagnostics.util';
import {
  type ISubscriptionFailureError,
  SubscriptionChangeFailureCode,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
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

/** The catch-all code of each endpoint, used to label a cause we cannot name. */
const UNCLASSIFIED_CODES: ReadonlySet<string> = new Set([
  SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
  SubscriptionPreviewFailureCode.PREVIEW_FAILED,
]);

/**
 * Writes a classified subscription billing failure as one JSON:API error
 * member that keeps the public `code` and retry `meta` (the global
 * HttpExceptionFilter drops both). Retryable failures also advertise
 * `Retry-After`. Only faults that a retry cannot clear reach error tracking;
 * everything else is expected client or provider state and is logged with
 * safe diagnostics.
 */
@Catch(SubscriptionBillingException)
export class SubscriptionBillingExceptionFilter
  implements ExceptionFilter<SubscriptionBillingException>
{
  private readonly sentryEnvironment: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.sentryEnvironment = this.configService.get('SENTRY_ENVIRONMENT') ?? '';
  }

  catch(exception: SubscriptionBillingException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const diagnostics = buildSubscriptionFailureDiagnostics({
      exception,
      isUnclassified: UNCLASSIFIED_CODES.has(exception.code),
    });

    const isFault =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && !exception.isRetryable;
    if (isFault) {
      this.loggerService.error(
        `${exception.title} with an unrecoverable fault`,
        undefined,
        diagnostics,
      );
      if (this.sentryEnvironment !== 'development') {
        Sentry.captureException(exception, { extra: diagnostics });
      }
    } else {
      this.loggerService.warn(`${exception.title}`, diagnostics);
    }

    if (exception.meta.retryAfterSeconds !== null) {
      response.setHeader(
        'Retry-After',
        String(exception.meta.retryAfterSeconds),
      );
    }

    const error: ISubscriptionFailureError = {
      code: exception.code,
      detail: exception.message,
      meta: exception.meta,
      status: String(status),
      title: exception.title,
    };
    response.status(status).json({ errors: [error] });
  }
}
