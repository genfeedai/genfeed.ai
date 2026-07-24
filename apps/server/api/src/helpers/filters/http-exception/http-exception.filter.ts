import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request as ExpressRequest } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter extends AllExceptionFilter {
  public catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
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

    if (status >= 500) {
      if (this.SENTRY_ENVIRONMENT !== 'development') {
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
    } else {
      // 4xx are expected client/bot traffic (bad input, 404 probes such as
      // /favicon.ico). Log at warn without the exception stack and never page
      // Sentry — mirrors AllExceptionFilter's 4xx handling. Previously every
      // 4xx hit .error() with the raw exception, emitting a stack trace on
      // every missing-static-asset request.
      this.loggerService.warn('HTTP client error occurred', {
        method: req.method,
        operation: 'catch',
        service: 'HttpExceptionFilter',
        status,
        url: req.originalUrl,
      });
    }

    this.writeJsonApiError(res, {
      detail,
      pointer: req.originalUrl,
      source,
      status,
      title,
    });
  }
}
