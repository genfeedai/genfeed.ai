import { redactEmailTrackingUrl } from '@api/helpers/utils/email-tracking-url.util';
import {
  isOAuthErrorPath,
  isOAuthRegistrationPath,
  OAuthExceptionFilter,
  OAuthRegistrationExceptionFilter,
} from '@api/oauth/filters/oauth-exception.filter';
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
    if (this.catchOAuthEndpointFailure(exception, host)) {
      return;
    }

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
      `${req.method} ${redactEmailTrackingUrl(req.originalUrl)} ${status} — ${internalDetail}`,
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
      pointer: redactEmailTrackingUrl(req.originalUrl),
      status,
      title,
    });
  }

  /**
   * Failures raised before routing — malformed JSON or an oversized body from
   * the Express body parser — never reach the controller-scoped
   * OAuthExceptionFilter, so OAuth and Auth.md paths are routed to it here to
   * keep every response RFC-shaped (#4949). Returns whether it responded.
   */
  protected catchOAuthEndpointFailure(
    exception: unknown,
    host: ArgumentsHost,
  ): boolean {
    const path = host.switchToHttp().getRequest<ExpressRequest>()?.path;
    if (!isOAuthErrorPath(path)) {
      return false;
    }

    const filter = isOAuthRegistrationPath(path)
      ? new OAuthRegistrationExceptionFilter(
          this.loggerService,
          this.configService,
        )
      : new OAuthExceptionFilter(this.loggerService, this.configService);
    filter.catch(exception, host);
    return true;
  }

  protected writeJsonApiError(
    res: ExpressResponse,
    error: {
      /**
       * Stable, non-generic code (e.g. `BrandScrapeErrorCode`) an exception
       * attached to its own response body. Falls back to the HTTP status
       * string so every JSON:API error keeps a `code` member (#5080).
       */
      code?: string;
      detail: string;
      pointer: string;
      source?: Record<string, unknown>;
      status: number;
      title: string;
    },
  ) {
    res.status(error.status).json(
      new this.JSONAPIError({
        code: error.code ?? error.status.toString(),
        detail: error.detail,
        source: error.source ?? {
          pointer: error.pointer,
        },
        // The HTTP status always goes on its own `status` member (per
        // JSON:API) so a client never has to parse a semantic `code` (e.g.
        // `BrandScrapeErrorCode`) to learn the status — `code` used to be
        // the only place the status appeared, which broke every client
        // helper that read it from there once `code` stopped being a status
        // string (#5080 review).
        status: error.status.toString(),
        title: error.title,
      }),
    );
  }
}
