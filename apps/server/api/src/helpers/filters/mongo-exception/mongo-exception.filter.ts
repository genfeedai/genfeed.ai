import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

@Catch()
export class MongoExceptionFilter extends AllExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ExpressResponse>();
    const req = ctx.getRequest<ExpressRequest>();

    const exceptionObj = exception as Record<string, unknown>;

    // Only handle MongoDB-specific errors
    // Check if this is actually a MongoDB error
    const isMongoError =
      exceptionObj.errmsg ||
      exceptionObj.codeName ||
      (exceptionObj.code &&
        typeof exceptionObj.code === 'number' &&
        this.isMongoErrorCode(exceptionObj.code)) ||
      exceptionObj.name === 'MongoError' ||
      exceptionObj.name === 'MongoServerError' ||
      exceptionObj.name === 'MongoNetworkError' ||
      exceptionObj.name === 'MongoTimeoutError' ||
      (exceptionObj.constructor &&
        typeof exceptionObj.constructor === 'object' &&
        exceptionObj.constructor !== null &&
        'name' in exceptionObj.constructor &&
        // @ts-expect-error TS2339
        (exceptionObj.constructor?.name === 'MongoError' ||
          // @ts-expect-error TS2339
          exceptionObj.constructor?.name === 'MongoServerError'));

    // If not a MongoDB error, let other filters handle it
    if (!isMongoError) {
      return super.catch(exception, host);
    }

    // Map MongoDB error codes to appropriate HTTP status codes
    let status: HttpStatus = HttpStatus.BAD_REQUEST;
    let detail =
      (exceptionObj.errmsg as string) ||
      (exceptionObj.message as string) ||
      'Database operation failed';
    let title = (exceptionObj.name as string) || 'Database Error';

    // Handle specific MongoDB error codes
    if (exceptionObj.code && typeof exceptionObj.code === 'number') {
      switch (exceptionObj.code) {
        case 11000: // Duplicate key error
          status = HttpStatus.CONFLICT;
          title = 'Duplicate Entry';
          detail = 'A record with this value already exists';
          break;
        case 2: // BadValue
          status = HttpStatus.BAD_REQUEST;
          title = 'Invalid Value';
          break;
        case 13: // Unauthorized
          status = HttpStatus.UNAUTHORIZED;
          title = 'Database Access Denied';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          break;
      }
    }

    if (this.SENTRY_ENVIRONMENT !== 'development') {
      Sentry.captureException(exception);
    } else {
      this.loggerService.error(
        `${req.method} ${req.originalUrl} ${status} — ${title}: ${detail}`,
        {
          mongoCode: exceptionObj.code,
          operation: 'catch',
          service: 'MongoExceptionFilter',
        },
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

  /**
   * Check if an error code is a MongoDB error code
   * MongoDB error codes are typically:
   * - 1-100: General errors
   * - 50-200: Network errors
   * - 11000-11010: Duplicate key errors
   * - 16755: JavaScript execution errors
   * - HTTP status codes (400, 401, etc.) are NOT MongoDB codes
   */
  private isMongoErrorCode(code: number): boolean {
    // Common MongoDB error codes
    const mongoErrorCodes = [
      2, // BadValue
      13, // Unauthorized
      50, // MaxTimeMSExpired
      51, // UnknownError
      11000, // DuplicateKey
      11001, // DuplicateKeyUpdate
      16755, // JavaScriptExecution
    ];

    if (mongoErrorCodes.includes(code)) {
      return true;
    }

    // MongoDB error codes >= 1000 are typically MongoDB-specific
    if (code >= 1000) {
      return true;
    }

    // MongoDB codes in 1-99 range are valid
    if (code >= 1 && code <= 99) {
      return true;
    }

    // Codes in 100-599 range are typically HTTP status codes, not MongoDB
    // (unless they're in the mongoErrorCodes list above)
    if (code >= 100 && code <= 599) {
      return false;
    }

    return false;
  }
}
