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
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type MockFn = ReturnType<typeof vi.fn>;

describe('OAuthExceptionFilter', () => {
  let logger: { error: MockFn; warn: MockFn };
  let response: { json: MockFn; setHeader: MockFn; status: MockFn };
  let host: ArgumentsHost;

  const config = {
    get: (key: string) =>
      key === 'SENTRY_ENVIRONMENT' ? 'production' : undefined,
  } as unknown as ConfigService;

  function build(): OAuthExceptionFilter {
    return new OAuthExceptionFilter(logger as unknown as LoggerService, config);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    logger = { error: vi.fn(), warn: vi.fn() };
    response = { json: vi.fn(), setHeader: vi.fn(), status: vi.fn() };
    response.status.mockReturnValue(response);
    response.setHeader.mockReturnValue(response);
    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/v1/oauth/token' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('writes a named OAuth error as the RFC body with no JSON:API envelope', () => {
    build().catch(
      new BadRequestException({
        error: 'invalid_grant',
        error_description: 'Invalid refresh token',
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_grant',
      error_description: 'Invalid refresh token',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('flattens ValidationPipe failures into invalid_request', () => {
    build().catch(
      new BadRequestException({
        errors: [
          {
            constraints: { isString: 'client_id must be a string' },
            property: 'client_id',
          },
        ],
        message: 'Validation failed',
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_request',
      error_description: 'client_id must be a string',
    });
  });

  it('maps DTO failures on registration to invalid_client_metadata', () => {
    new OAuthRegistrationExceptionFilter(
      logger as unknown as LoggerService,
      config,
    ).catch(
      new BadRequestException({
        errors: [
          {
            constraints: { arrayNotEmpty: 'redirect_uris should not be empty' },
            property: 'redirect_uris',
          },
        ],
        message: 'Validation failed',
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_client_metadata',
      error_description: 'redirect_uris should not be empty',
    });
  });

  it('keeps a registration error the service named (invalid_redirect_uri)', () => {
    new OAuthRegistrationExceptionFilter(
      logger as unknown as LoggerService,
      config,
    ).catch(
      new BadRequestException({
        error: 'invalid_redirect_uri',
        error_description: 'Redirect URI scheme "javascript" is not allowed',
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_redirect_uri',
      error_description: 'Redirect URI scheme "javascript" is not allowed',
    });
  });

  it('maps the rate limiter to temporarily_unavailable with its detail', () => {
    build().catch(
      new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          detail: 'Rate limit exceeded. Please retry after 60 seconds.',
          title: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      error: 'temporarily_unavailable',
      error_description: 'Rate limit exceeded. Please retry after 60 seconds.',
    });
  });

  it.each([
    [new UnauthorizedException('Invalid claim code'), 'access_denied'],
    [
      new ForbiddenException({
        code: 'PLAN_LIMIT_EXCEEDED',
        detail: 'API access is available on paid plans.',
        title: 'API access requires a paid plan',
      }),
      'access_denied',
    ],
    [new GoneException('This claim is no longer available.'), 'expired_token'],
  ])('derives an RFC code from Nest exception %#', (exception, error) => {
    build().catch(exception, host);

    expect(response.json).toHaveBeenCalledWith({
      error,
      error_description: expect.not.stringMatching(/^$/),
    });
  });

  it('ignores a non-RFC `error` label such as Nest\'s "Unauthorized"', () => {
    build().catch(
      new UnauthorizedException('User identity is incomplete'),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: 'access_denied',
      error_description: 'User identity is incomplete',
    });
  });

  it('hides unexpected failures behind server_error and reports them', () => {
    const failure = new Error('connection refused to 10.0.0.4');
    build().catch(failure, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: 'server_error',
      error_description:
        'The authorization server encountered an unexpected error.',
    });
    expect(logger.error).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });

  it('keeps the client status of a raw body-parser error instead of a 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
    });
    build().catch(tooLarge, host);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      error: 'invalid_request',
      error_description: 'request entity too large',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('answers a 503 as temporarily_unavailable', () => {
    build().catch(new ServiceUnavailableException('Redis down'), host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'temporarily_unavailable' }),
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
