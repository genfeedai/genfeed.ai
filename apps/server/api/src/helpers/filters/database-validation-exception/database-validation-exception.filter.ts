import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request as ExpressRequest } from 'express';

// Generic validation error filter for database validation failures (Prisma or otherwise)
@Catch(Error)
export class DatabaseValidationExceptionFilter extends AllExceptionFilter {
  public catch(exception: Error, host: ArgumentsHost) {
    // Only handle validation errors (Prisma validation or custom validation errors)
    if (
      !exception.name.includes('ValidationError') &&
      !exception.constructor.name.includes('PrismaClientValidationError')
    ) {
      throw exception;
    }
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<ExpressRequest>();
    const status: HttpStatus = HttpStatus.BAD_REQUEST;

    const detail = exception.message;
    const title = exception.name;

    if (this.SENTRY_ENVIRONMENT !== 'development') {
      Sentry.captureException(exception, {
        extra: {
          method: req.method,
          url: req.originalUrl,
        },
      });
    } else {
      this.loggerService.error(
        `ValidationError on ${req.method} ${req.originalUrl}`,
        { detail, title },
      );
    }

    this.writeJsonApiError(res, {
      detail,
      pointer: req.originalUrl,
      status,
      title,
    });
  }
}
