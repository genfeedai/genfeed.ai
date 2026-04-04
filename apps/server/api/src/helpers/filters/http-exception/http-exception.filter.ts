import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

@Catch(HttpException)
export class HttpExceptionFilter extends AllExceptionFilter {
  public catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ExpressResponse>();
    const req = ctx.getRequest<ExpressRequest>();
    const status: HttpStatus = exception.getStatus();
    const response: unknown = exception.getResponse();

    // Extract error information from custom exceptions or default HttpException
    let title = 'HTTP Exception';
    let detail = 'An error occurred';
    let source: Record<string, unknown> | undefined;

    if (response && typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;
      title =
        (responseObj.title as string) ||
        (responseObj.error as string) ||
        exception.name ||
        title;
      detail =
        (responseObj.detail as string) ||
        (responseObj.message as string) ||
        detail;
      source = responseObj.source as Record<string, unknown> | undefined;
    } else if (typeof response === 'string') {
      detail = response;
    }

    if (this.SENTRY_ENVIRONMENT !== 'development' && status >= 500) {
      Sentry.captureException(exception);
    } else {
      this.loggerService.error('HTTP exception occurred', exception, {
        method: req.method,
        operation: 'catch',
        service: 'HttpExceptionFilter',
        status,
        url: req.originalUrl,
      });
    }

    res.status(status).json(
      new this.JSONAPIError({
        code: status.toString(),
        detail,
        source: source || {
          pointer: req.originalUrl,
        },
        title,
      }),
    );
  }
}
