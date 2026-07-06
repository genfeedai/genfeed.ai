import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import jsonAPI from 'jsonapi-serializer';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  public readonly constructorName: string = String(this.constructor.name);

  public readonly SENTRY_ENVIRONMENT: string;
  public readonly SENTRY_DSN: string;
  public readonly JSONAPIError = jsonAPI.Error;
  protected readonly isProduction: boolean;

  constructor(
    public readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.SENTRY_ENVIRONMENT =
      this.configService.get('SENTRY_ENVIRONMENT') ?? '';
    this.SENTRY_DSN = this.configService.get('SENTRY_DSN') ?? '';
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
  }

  public catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ExpressResponse>();
    const req = ctx.getRequest<ExpressRequest>();

    // Determine appropriate HTTP status code
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'An unexpected error occurred';
    let title = 'Internal Server Error';

    // Handle different exception types
    const exceptionObj = exception as Record<string, unknown>;
    if (
      exceptionObj.getStatus &&
      typeof exceptionObj.getStatus === 'function'
    ) {
      status = (exceptionObj.getStatus as () => number)();
      const response = (exceptionObj.getResponse as () => unknown)();
      if (typeof response === 'object' && response !== null) {
        const respObj = response as Record<string, unknown>;
        detail =
          (respObj.detail as string) || (respObj.message as string) || detail;
        title =
          (respObj.title as string) || (exceptionObj.name as string) || title;
      } else {
        detail = (response as string) || detail;
        title = (exceptionObj.name as string) || title;
      }
    } else if (exceptionObj.errmsg || exceptionObj.codeName) {
      // Legacy database driver errors — never expose raw DB messages in production
      status = HttpStatus.BAD_REQUEST;
      detail = this.isProduction
        ? 'A database error occurred'
        : (exceptionObj.errmsg as string) || detail;
      title = this.isProduction
        ? 'Database Error'
        : (exceptionObj.codeName as string) || 'Database Error';
    } else if (exceptionObj.message) {
      // Generic errors — only expose raw message in development
      detail = this.isProduction
        ? 'An unexpected error occurred'
        : (exceptionObj.message as string);
      title = this.isProduction
        ? 'Internal Server Error'
        : (exceptionObj.name as string) || 'Application Error';
    }

    // Log the real error detail internally regardless of production mode — the
    // redaction only applies to what we send back to the API client.
    const internalDetail =
      (exceptionObj.message as string | undefined) ?? detail;
    this.loggerService.error(
      `${req.method} ${req.originalUrl} ${status} — ${internalDetail}`,
      {
        operation: 'catch',
        service: this.constructorName,
      },
    );

    // Only report server-side failures. Exceptions that resolve to a 4xx are
    // expected client/bot traffic (404 probes, bad input) and must not page
    // Sentry — see HttpExceptionFilter for the HttpException equivalent.
    if (this.SENTRY_ENVIRONMENT !== 'development' && status >= 500) {
      Sentry.captureException(exception);
    }

    this.writeJsonApiError(res, {
      detail,
      pointer: req.originalUrl,
      status,
      title,
    });
  }

  protected writeJsonApiError(
    res: ExpressResponse,
    error: {
      detail: string;
      pointer: string;
      source?: Record<string, unknown>;
      status: number;
      title: string;
    },
  ) {
    res.status(error.status).json(
      new this.JSONAPIError({
        code: error.status.toString(),
        detail: error.detail,
        source: error.source ?? {
          pointer: error.pointer,
        },
        title: error.title,
      }),
    );
  }
}
