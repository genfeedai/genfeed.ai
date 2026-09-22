import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

/** RFC 6749 §5.2 / RFC 7591 §3.2.2 error body. */
export interface OAuthErrorBody {
  error: string;
  error_description: string;
}

/**
 * Endpoints whose every failure must be RFC-shaped: the OAuth authorization
 * server and the Auth.md agent-auth flow. Matched against the Express path,
 * which includes the global `v1` prefix.
 */
const OAUTH_ERROR_PATH =
  /^\/v1\/(?:oauth\/(?:authorize(?:\/decision)?|register|revoke|token)|agent\/auth(?:\/[a-z/]*)?)\/?$/i;

// Case-insensitive like Express routing, so `/v1/OAuth/register` is covered too.
const OAUTH_REGISTRATION_PATH = /^\/v1\/oauth\/register\/?$/i;

export function isOAuthErrorPath(path: string | undefined): boolean {
  return !!path && OAUTH_ERROR_PATH.test(path);
}

export function isOAuthRegistrationPath(path: string | undefined): boolean {
  return !!path && OAUTH_REGISTRATION_PATH.test(path);
}

/** An OAuth error code is lowercase ASCII with underscores (RFC 6749 §5.2). */
const OAUTH_ERROR_CODE = /^[a-z][a-z0-9_]*$/;

const SERVER_ERROR_DESCRIPTION =
  'The authorization server encountered an unexpected error.';

interface ValidationFailure {
  constraints?: Record<string, string>;
  property?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === 'string' && !!part.trim(),
    );
    return parts.length > 0 ? parts.join('; ') : undefined;
  }
  return undefined;
}

/**
 * HttpExceptions carry their status. Express body-parser failures that reach
 * the global filters unmapped (413 too large, 415 unsupported charset) are
 * http-errors objects with a client `status`; keep it rather than reporting a
 * client mistake as a 500 (#4949 review).
 */
function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (isRecord(exception)) {
    const status = exception.status ?? exception.statusCode;
    if (
      typeof status === 'number' &&
      status >= HttpStatus.BAD_REQUEST &&
      status < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      return status;
    }
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/** Flattens the ValidationPipe's `{ errors: [{ property, constraints }] }`. */
function describeValidationFailures(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const messages = (value as ValidationFailure[]).flatMap((failure) =>
    Object.values(failure?.constraints ?? {}),
  );
  return messages.length > 0 ? messages.join('; ') : undefined;
}

/**
 * Writes every failure on an OAuth or Auth.md endpoint as an RFC-shaped
 * `{ error, error_description }` body (#4949).
 *
 * The global HttpExceptionFilter rewrites exceptions into the JSON:API
 * `{ errors: [...] }` envelope and drops `error_description`, so OAuth
 * clients (the MCP SDK, Cursor, Grok Bot) cannot parse `invalid_grant`,
 * `invalid_client`, or a redirect rejection, and fall into retry loops.
 * Bound at controller scope, this filter takes precedence over the global
 * chain for these endpoints only, including exceptions thrown by guards
 * (the rate limiter) and the validation pipe.
 */
@Catch()
export class OAuthExceptionFilter implements ExceptionFilter {
  /** Error code for a 400 that did not name one (e.g. DTO validation). */
  protected readonly invalidRequestError: string = 'invalid_request';

  private readonly sentryEnvironment: string;

  constructor(
    private readonly loggerService: LoggerService,
    configService: ConfigService,
  ) {
    this.sentryEnvironment = configService.get('SENTRY_ENVIRONMENT') ?? '';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status = resolveStatus(exception);
    const body = this.toOAuthError(exception, status);

    const context = {
      error: body.error,
      method: request.method,
      operation: 'catch',
      path: request.path,
      service: OAuthExceptionFilter.name,
      status,
    };
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.loggerService.error('OAuth endpoint failed', exception, context);
      if (this.sentryEnvironment !== 'development') {
        Sentry.captureException(exception);
      }
    } else {
      this.loggerService.warn('OAuth endpoint rejected a request', context);
    }

    response
      .status(status)
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Pragma', 'no-cache')
      .json(body);
  }

  toOAuthError(exception: unknown, status: number): OAuthErrorBody {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        error:
          status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'temporarily_unavailable'
            : 'server_error',
        error_description: SERVER_ERROR_DESCRIPTION,
      };
    }

    const payload =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const record = isRecord(payload) ? payload : {};
    const namedError = readString(record.error);
    const error =
      namedError && OAUTH_ERROR_CODE.test(namedError)
        ? namedError
        : this.defaultErrorFor(status);
    const description =
      readString(record.error_description) ??
      describeValidationFailures(record.errors) ??
      readString(record.detail) ??
      readString(record.message) ??
      readString(payload) ??
      (exception instanceof Error ? readString(exception.message) : undefined);

    return {
      error,
      error_description: description ?? 'The request could not be completed.',
    };
  }

  private defaultErrorFor(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        return 'access_denied';
      case HttpStatus.GONE:
        return 'expired_token';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'temporarily_unavailable';
      default:
        return this.invalidRequestError;
    }
  }
}

/**
 * Dynamic client registration (RFC 7591 §3.2.2): a body that fails DTO
 * validation is `invalid_client_metadata`, not `invalid_request`.
 */
@Catch()
export class OAuthRegistrationExceptionFilter extends OAuthExceptionFilter {
  protected override readonly invalidRequestError = 'invalid_client_metadata';
}
