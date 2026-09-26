import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { redactEmailTrackingUrl } from '@api/helpers/utils/email-tracking-url.util';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request as ExpressRequest } from 'express';

interface ValidatorFieldError {
  field: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function constraintMessage(constraints: unknown): string | undefined {
  if (!isRecord(constraints)) return undefined;
  const messages = Object.values(constraints).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return messages.length > 0 ? messages.join('; ') : undefined;
}

/**
 * Field errors from the shared REST `ValidationPipe` (`property` +
 * `constraints`) or from `ErrorResponse.validationFailed` (`field` +
 * `message`). String-only `errors` arrays stay on the generic JSON:API path.
 */
function readValidatorFieldErrors(
  response: Record<string, unknown>,
): ValidatorFieldError[] {
  const errors: ValidatorFieldError[] = [];
  const declared = response.validationErrors;
  if (Array.isArray(declared)) {
    for (const item of declared) {
      if (
        isRecord(item) &&
        typeof item.field === 'string' &&
        typeof item.message === 'string'
      ) {
        errors.push({ field: item.field, message: item.message });
      }
    }
  }

  const pipeErrors = response.errors;
  if (Array.isArray(pipeErrors)) {
    for (const item of pipeErrors) {
      if (!isRecord(item) || typeof item.property !== 'string') continue;
      const message = constraintMessage(item.constraints);
      if (message) {
        errors.push({ field: item.property, message });
      }
    }
  }

  return errors;
}

@Catch(HttpException)
export class HttpExceptionFilter extends AllExceptionFilter {
  public catch(exception: HttpException, host: ArgumentsHost) {
    if (this.catchOAuthEndpointFailure(exception, host)) {
      return;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<ExpressRequest>();
    const status: HttpStatus = exception.getStatus();
    const response: unknown = exception.getResponse();

    // Extract error information from custom exceptions or default HttpException
    let title = 'HTTP Exception';
    let detail = 'An error occurred';
    let source: Record<string, unknown> | undefined;
    let fieldErrors: ValidatorFieldError[] = [];
    // Stable, non-generic code (e.g. `BrandScrapeErrorCode`) an exception
    // author attached to its response body. Falls back to the HTTP status
    // string below so every error stays JSON:API-shaped (#5080).
    let code: string | undefined;

    if (response && typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;
      title =
        (responseObj.title as string) ||
        (responseObj.error as string) ||
        exception.name ||
        title;
      const responseMessage = Array.isArray(responseObj.message)
        ? responseObj.message
            .filter((value): value is string => typeof value === 'string')
            .join('; ')
        : responseObj.message;
      detail =
        (responseObj.detail as string) ||
        (typeof responseMessage === 'string' ? responseMessage : '') ||
        detail;
      source = responseObj.source as Record<string, unknown> | undefined;
      fieldErrors = readValidatorFieldErrors(responseObj);
      code =
        typeof responseObj.code === 'string' ? responseObj.code : undefined;
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
          url: redactEmailTrackingUrl(req.originalUrl),
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
        url: redactEmailTrackingUrl(req.originalUrl),
      });
    }

    if (fieldErrors.length > 0) {
      res.status(status).json({
        errors: fieldErrors.map((fieldError) => ({
          code: String(status),
          detail: fieldError.message,
          source: { pointer: `/${fieldError.field}` },
          status: String(status),
          title: 'Validation failed',
        })),
      });
      return;
    }

    this.writeJsonApiError(res, {
      code,
      detail,
      pointer: redactEmailTrackingUrl(req.originalUrl),
      source,
      status,
      title,
    });
  }
}
