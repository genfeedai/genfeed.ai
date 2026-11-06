import {
  isOAuthErrorPath,
  isOAuthRegistrationPath,
  OAuthExceptionFilter,
  OAuthRegistrationExceptionFilter,
} from '@api/oauth/filters/oauth-exception.filter';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ reported: [] as unknown[] }));

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: (exception: unknown) => {
    sentry.reported.push(exception);
  },
}));

interface Written {
  body?: unknown;
  headers: Record<string, string>;
  status?: number;
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
const SERVER_ERROR_DESCRIPTION =
  'The authorization server encountered an unexpected error.';

describe('OAuthExceptionFilter', () => {
  let written: Written;
  let logged: { level: 'error' | 'warn'; message: string }[];
  let host: ArgumentsHost;
  let logger: LoggerService;

  const config = {
    get: (key: string) =>
      key === 'SENTRY_ENVIRONMENT' ? 'production' : undefined,
  } as unknown as ConfigService;

  const handle = (exception: unknown) => {
    new OAuthExceptionFilter(logger, config).catch(exception, host);
    return written;
  };
  const handleRegistration = (exception: unknown) => {
    new OAuthRegistrationExceptionFilter(logger, config).catch(exception, host);
    return written;
  };

  beforeEach(() => {
    sentry.reported = [];
    written = { headers: {} };
    logged = [];
    logger = {
      error: (message: string) => {
        logged.push({ level: 'error', message });
      },
      warn: (message: string) => {
        logged.push({ level: 'warn', message });
      },
    } as unknown as LoggerService;
    // An Express response that records what the filter wrote.
    const response = {
      json: (body: unknown) => {
        written.body = body;
        return response;
      },
      setHeader: (name: string, value: string) => {
        written.headers[name] = value;
        return response;
      },
      status: (status: number) => {
        written.status = status;
        return response;
      },
    };
    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/v1/oauth/token' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('writes a named OAuth error as an uncached RFC body and only warns', () => {
    expect(
      handle(
        new BadRequestException({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        }),
      ),
    ).toEqual({
      body: {
        error: 'invalid_grant',
        error_description: 'Invalid refresh token',
      },
      headers: NO_STORE,
      status: 400,
    });
    expect(logged).toEqual([
      { level: 'warn', message: 'OAuth endpoint rejected a request' },
    ]);
    expect(sentry.reported).toEqual([]);
  });

  it.each([
    [
      'flattens ValidationPipe failures into invalid_request',
      handle,
      'client_id must be a string',
      'invalid_request',
    ],
    [
      'maps registration DTO failures to invalid_client_metadata',
      handleRegistration,
      'redirect_uris should not be empty',
      'invalid_client_metadata',
    ],
  ])('%s', (_case, filter, constraint, error) => {
    expect(
      filter(
        new BadRequestException({
          errors: [{ constraints: { rule: constraint }, property: 'field' }],
          message: 'Validation failed',
        }),
      ).body,
    ).toEqual({ error, error_description: constraint });
  });

  it('keeps a registration error the service named (invalid_redirect_uri)', () => {
    const body = {
      error: 'invalid_redirect_uri',
      error_description: 'Redirect URI scheme "javascript" is not allowed',
    };

    expect(handleRegistration(new BadRequestException(body)).body).toEqual(
      body,
    );
  });

  it('maps the rate limiter to temporarily_unavailable with its detail', () => {
    expect(
      handle(
        new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            detail: 'Rate limit exceeded. Please retry after 60 seconds.',
            title: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      ),
    ).toMatchObject({
      body: {
        error: 'temporarily_unavailable',
        error_description:
          'Rate limit exceeded. Please retry after 60 seconds.',
      },
      status: 429,
    });
  });

  it.each([
    [
      new UnauthorizedException('Invalid claim code'),
      'access_denied',
      'Invalid claim code',
    ],
    [
      new UnauthorizedException('User identity is incomplete'),
      'access_denied',
      'User identity is incomplete',
    ],
    [
      new ForbiddenException({
        code: 'PLAN_LIMIT_EXCEEDED',
        detail: 'API access is available on paid plans.',
        title: 'API access requires a paid plan',
      }),
      'access_denied',
      'API access is available on paid plans.',
    ],
    [
      new GoneException('This claim is no longer available.'),
      'expired_token',
      'This claim is no longer available.',
    ],
  ])(
    'derives an RFC code from Nest exception %#, ignoring Nest error labels',
    (exception, error, description) => {
      expect(handle(exception).body).toEqual({
        error,
        error_description: description,
      });
    },
  );

  it('hides an unexpected failure behind server_error and reports it', () => {
    const failure = new Error('connection refused to 10.0.0.4');

    expect(handle(failure)).toMatchObject({
      body: {
        error: 'server_error',
        error_description: SERVER_ERROR_DESCRIPTION,
      },
      status: 500,
    });
    expect(logged).toEqual([
      { level: 'error', message: 'OAuth endpoint failed' },
    ]);
    expect(sentry.reported).toEqual([failure]);
  });

  it('keeps the client status of a raw body-parser error instead of a 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
    });

    expect(handle(tooLarge)).toMatchObject({
      body: {
        error: 'invalid_request',
        error_description: 'request entity too large',
      },
      status: 413,
    });
    expect(sentry.reported).toEqual([]);
  });

  it('answers a 503 as temporarily_unavailable without leaking its cause', () => {
    expect(handle(new ServiceUnavailableException('Redis down'))).toMatchObject(
      {
        body: {
          error: 'temporarily_unavailable',
          error_description: SERVER_ERROR_DESCRIPTION,
        },
        status: 503,
      },
    );
  });
});

describe('isOAuthErrorPath', () => {
  it.each([
    '/v1/oauth/register',
    '/v1/oauth/token',
    '/v1/oauth/revoke',
    '/v1/oauth/authorize',
    '/v1/oauth/authorize/decision',
    '/v1/agent/auth',
    '/v1/agent/auth/claim/complete',
  ])('routes %s to the OAuth error shape', (path) => {
    expect(isOAuthErrorPath(path)).toBe(true);
  });

  it.each([
    undefined,
    '/v1/oauth-lookalike',
    '/v1/oauth/cli',
    '/v1/oauth/register/extra',
    '/v1/users/me',
    '/oauth/token',
  ])('leaves %s on the JSON:API envelope', (path) => {
    expect(isOAuthErrorPath(path)).toBe(false);
  });

  it('matches case-insensitively, like Express routing', () => {
    expect(isOAuthErrorPath('/v1/OAuth/Token')).toBe(true);
    expect(isOAuthRegistrationPath('/V1/OAUTH/REGISTER')).toBe(true);
  });

  it('singles out dynamic registration', () => {
    expect(isOAuthRegistrationPath('/v1/oauth/register')).toBe(true);
    expect(isOAuthRegistrationPath('/v1/oauth/token')).toBe(false);
  });
});
