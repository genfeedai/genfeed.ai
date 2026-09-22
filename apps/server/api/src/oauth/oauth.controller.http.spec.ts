import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { OAuthAuthorizeController } from '@api/oauth/controllers/oauth-authorize.controller';
import { OAuthRegisterController } from '@api/oauth/controllers/oauth-register.controller';
import { OAuthRevokeController } from '@api/oauth/controllers/oauth-revoke.controller';
import { OAuthTokenController } from '@api/oauth/controllers/oauth-token.controller';
import { buildApiCorsOptionsDelegate } from '@api/oauth/oauth-cors.util';
import { OAuthAuthorizeService } from '@api/oauth/services/oauth-authorize.service';
import { OAuthClientService } from '@api/oauth/services/oauth-client.service';
import { OAuthRefreshTokenService } from '@api/oauth/services/oauth-refresh-token.service';
import type { CacheService } from '@api/services/cache/cache.service';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { getGenfeedCorsOptions } from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

const CURSOR_REDIRECT = 'cursor://anysphere.cursor-mcp/oauth/callback';

/**
 * Drives the OAuth endpoints through the real Nest pipeline — global
 * JSON:API filters, the global rate-limit guard, and the validation pipe — to
 * prove the controller-scoped OAuth filter wins for every failure a client
 * can hit (#4949), and that Cursor / Grok Bot can register (#4948).
 */
describe('OAuth endpoints real HTTP pipeline', () => {
  let app: INestApplication;
  const rateLimitCache = {
    expire: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
  };
  const clients = new Map<string, Record<string, unknown>>();
  const prisma = {
    oAuthClient: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const client = { ...data, createdAt: new Date('2026-09-22T12:00:00Z') };
        clients.set(String(data.clientId), client);
        return client;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { clientId: string } }) =>
          clients.get(where.clientId) ?? null,
      ),
    },
  };
  const authorizeService = {
    buildAuthorizeRedirect: vi.fn(),
    decideAuthorization: vi.fn(),
    exchangeToken: vi.fn(),
  };
  const refreshTokenService = {
    refresh: vi.fn(),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const configService = { get: () => undefined };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        OAuthRegisterController,
        OAuthAuthorizeController,
        OAuthTokenController,
        OAuthRevokeController,
      ],
      providers: [
        {
          provide: OAuthClientService,
          useValue: new OAuthClientService(prisma as unknown as PrismaService),
        },
        { provide: OAuthAuthorizeService, useValue: authorizeService },
        { provide: OAuthRefreshTokenService, useValue: refreshTokenService },
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: configService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.enableCors(
      buildApiCorsOptionsDelegate(
        getGenfeedCorsOptions({ isDevelopment: false }),
      ),
    );
    app.setGlobalPrefix('v1');
    app.useGlobalGuards(
      new RateLimitGuard(
        new Reflector(),
        rateLimitCache as unknown as CacheService,
      ),
    );
    app.useGlobalPipes(new ValidationPipe());
    const globalLogger = logger as unknown as LoggerService;
    const globalConfig = configService as unknown as ConfigService;
    app.useGlobalFilters(new AllExceptionFilter(globalLogger, globalConfig));
    app.useGlobalFilters(new HttpExceptionFilter(globalLogger, globalConfig));
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitCache.incr.mockResolvedValue(1);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/oauth/register', () => {
    it('registers the cursor:// redirect Cursor and Grok Bot send (#4948)', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({
          client_name: 'Cursor',
          grant_types: ['authorization_code', 'refresh_token'],
          redirect_uris: [CURSOR_REDIRECT],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        })
        .expect(201);

      expect(result.body).toMatchObject({
        client_id: expect.stringMatching(/^oauth_/),
        redirect_uris: [CURSOR_REDIRECT],
        token_endpoint_auth_method: 'none',
      });
      expect(result.headers['cache-control']).toBe('no-store');
    });

    it('ignores unrecognized client metadata instead of rejecting it (RFC 7591 §2)', async () => {
      await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({
          client_uri: 'https://cursor.com',
          logo_uri: 'https://cursor.com/logo.png',
          redirect_uris: [CURSOR_REDIRECT],
          scope: 'mcp',
          software_id: 'cursor-mcp',
        })
        .expect(201);
    });

    it('rejects an unsafe redirect with an RFC 7591 body, not JSON:API', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({ redirect_uris: ['javascript:alert(1)'] })
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_redirect_uri',
        error_description: 'Redirect URI scheme "javascript" is not allowed',
      });
      expect(result.headers['cache-control']).toBe('no-store');
    });

    it('reports a malformed body as invalid_client_metadata', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({ client_name: 'No redirects' })
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_client_metadata',
        error_description: expect.stringContaining('redirect_uris'),
      });
    });

    it('answers the rate limiter with an OAuth error and Retry-After (#4951)', async () => {
      rateLimitCache.incr.mockResolvedValue(61);

      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({ redirect_uris: [CURSOR_REDIRECT] })
        .expect(429);

      expect(result.body).toEqual({
        error: 'temporarily_unavailable',
        error_description: expect.stringContaining('retry after 60 seconds'),
      });
      expect(result.headers['retry-after']).toBe('60');
    });

    it('allows the raised per-IP budget for shared hosted-client egress (#4951)', async () => {
      rateLimitCache.incr.mockResolvedValue(60);

      await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .send({ redirect_uris: [CURSOR_REDIRECT] })
        .expect(201);
    });
  });

  describe('POST /v1/oauth/token', () => {
    it('answers an unknown grant with unsupported_grant_type', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/token')
        .type('form')
        .send({ client_id: 'oauth_client', grant_type: 'client_credentials' })
        .expect(400);

      expect(result.body).toEqual({
        error: 'unsupported_grant_type',
        error_description: 'Unsupported grant type',
      });
    });

    it('answers missing PKCE fields with invalid_request', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/token')
        .type('form')
        .send({ client_id: 'oauth_client', grant_type: 'authorization_code' })
        .expect(400);

      expect(result.body.error).toBe('invalid_request');
      expect(result.body.error_description).toContain('code');
      expect(result.body).not.toHaveProperty('errors');
    });

    it('passes invalid_grant through so clients re-run authorization', async () => {
      refreshTokenService.refresh.mockRejectedValue(
        new BadRequestException({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        }),
      );

      const result = await request(app.getHttpServer())
        .post('/v1/oauth/token')
        .type('form')
        .send({
          client_id: 'oauth_client',
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token-that-was-rotated',
        })
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_grant',
        error_description: 'Invalid refresh token',
      });
    });

    it('hides unexpected failures behind server_error', async () => {
      authorizeService.exchangeToken.mockRejectedValue(
        new Error('prisma: connection refused'),
      );

      const result = await request(app.getHttpServer())
        .post('/v1/oauth/token')
        .type('form')
        .send({
          client_id: 'oauth_client',
          code: 'c'.repeat(43),
          code_verifier: 'v'.repeat(43),
          grant_type: 'authorization_code',
          redirect_uri: CURSOR_REDIRECT,
          resource: 'https://mcp.genfeed.ai/mcp',
        })
        .expect(500);

      expect(result.body).toEqual({
        error: 'server_error',
        error_description:
          'The authorization server encountered an unexpected error.',
      });
    });
  });

  describe('GET /v1/oauth/authorize', () => {
    it('reports an unknown client as invalid_client', async () => {
      authorizeService.buildAuthorizeRedirect.mockRejectedValue(
        new BadRequestException({
          error: 'invalid_client',
          error_description: 'Unknown OAuth client',
        }),
      );

      const result = await request(app.getHttpServer())
        .get('/v1/oauth/authorize')
        .query({
          client_id: 'oauth_unknown',
          code_challenge: 'a'.repeat(43),
          code_challenge_method: 'S256',
          redirect_uri: CURSOR_REDIRECT,
          resource: 'https://mcp.genfeed.ai/mcp',
          response_type: 'code',
        })
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_client',
        error_description: 'Unknown OAuth client',
      });
    });
  });

  describe('failures raised before routing', () => {
    it('answers malformed JSON on register with invalid_client_metadata', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_client_metadata',
        error_description: expect.any(String),
      });
      expect(result.headers['cache-control']).toBe('no-store');
    });

    it('answers malformed JSON on token with invalid_request', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/token')
        .set('Content-Type', 'application/json')
        .send('{"grant_type":')
        .expect(400);

      expect(result.body).toEqual({
        error: 'invalid_request',
        error_description: expect.any(String),
      });
    });

    it('matches OAuth paths case-insensitively, like Express routing', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/OAuth/Register')
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400);

      expect(result.body.error).toBe('invalid_client_metadata');
    });

    it('keeps an oversized body a 413 client error, not a 500', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/register')
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            client_name: 'x'.repeat(200_000),
            redirect_uris: [CURSOR_REDIRECT],
          }),
        )
        .expect(413);

      expect(result.body).toEqual({
        error: 'invalid_client_metadata',
        error_description: expect.any(String),
      });
    });

    it('leaves the JSON:API envelope on non-OAuth paths', async () => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth-lookalike')
        .set('Content-Type', 'application/json')
        .send('{')
        .expect(400);

      expect(result.body).toHaveProperty('errors');
      expect(result.body).not.toHaveProperty('error_description');
    });
  });

  describe('CORS', () => {
    it.each(['/v1/oauth/register', '/v1/oauth/token', '/v1/oauth/revoke'])(
      'lets a browser MCP client from any origin call %s',
      async (path) => {
        const result = await request(app.getHttpServer())
          .options(path)
          .set('Origin', 'https://inspector.example.dev')
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'content-type');

        expect(result.status).toBe(204);
        expect(result.headers['access-control-allow-origin']).toBe('*');
        expect(
          result.headers['access-control-allow-credentials'],
        ).toBeUndefined();
      },
    );

    it('keeps the session-bearing consent decision on the credentialed allowlist', async () => {
      const result = await request(app.getHttpServer())
        .options('/v1/oauth/authorize/decision')
        .set('Origin', 'https://inspector.example.dev')
        .set('Access-Control-Request-Method', 'POST');

      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still admits the Genfeed app origin with credentials elsewhere', async () => {
      const result = await request(app.getHttpServer())
        .options('/v1/oauth/authorize/decision')
        .set('Origin', 'https://app.genfeed.ai')
        .set('Access-Control-Request-Method', 'POST');

      expect(result.headers['access-control-allow-origin']).toBe(
        'https://app.genfeed.ai',
      );
      expect(result.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
