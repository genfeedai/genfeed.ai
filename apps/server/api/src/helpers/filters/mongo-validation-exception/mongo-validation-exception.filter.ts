import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Error as MongooseError } from 'mongoose';

@Catch(MongooseError.ValidationError)
export class MongoValidationExceptionFilter extends AllExceptionFilter {
  public catch(exception: MongooseError.ValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ExpressResponse>();
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
        `Mongoose ValidationError on ${req.method} ${req.originalUrl}`,
        { detail, title },
      );
    }

    res.status(status).json(
      new this.JSONAPIError({
        code: status.toString(),
        detail,
        source: {
          pointer: req.originalUrl,
        },
        title,
      }),
    );
  }
}
