import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseAuthorizationHeader } from '@libs/auth/authorization-header';
import { getMcpWwwAuthenticateHeader } from '@mcp/mcp/setup-page';
import {
  AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS,
  type AuthResult,
} from '@mcp/services/auth.service';
import type { RateLimitResult } from '@mcp/services/rate-limit.service';
import type { McpAuthMiddlewareDependencies } from '@mcp/shared/interfaces/mcp-auth-middleware.interface';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { mcpAccessModeMiddleware } from '@mcp/shared/middleware/mcp-access-mode.middleware';
import { createMcpAuthMiddleware } from '@mcp/shared/middleware/mcp-auth.middleware';
import { toolsetsQueryMiddleware } from '@mcp/shared/middleware/toolsets-query.middleware';
import {
  classifyMcpToolFailure,
  mcpJsonRpcError,
} from '@mcp/tools/mcp-tool-error';
import express from 'express';

const token = 'synthetic-mcp-auth-middleware-token';
const identity: AuthResult = {
  accessMode: 'standard',
  organizationId: 'synthetic-organization',
  role: 'admin',
  userId: 'synthetic-user',
  valid: true,
};
const allowed: RateLimitResult = {
  allowed: true,
  limit: 60,
  remaining: 59,
  resetAt: 1234567890,
  retryAfterSeconds: 0,
};
const routes = ['/mcp', '/mcp/claude'];
const methods = ['POST', 'GET', 'DELETE'];
const cases = routes.flatMap((route) =>
  methods.map((method) => [route, method]),
);

describe('createMcpAuthMiddleware mounted HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  let result: AuthResult;
  let rateLimit: RateLimitResult;
  let requests: McpRequest[];
  let downstream = vi.fn<() => void>();
  const authenticateRequest =
    vi.fn<
      McpAuthMiddlewareDependencies['authService']['authenticateRequest']
    >();
  const extractBearerToken =
    vi.fn<McpAuthMiddlewareDependencies['authService']['extractBearerToken']>();
  const consume =
    vi.fn<McpAuthMiddlewareDependencies['rateLimitService']['consume']>();
  const keyFor =
    vi.fn<McpAuthMiddlewareDependencies['rateLimitService']['keyFor']>();

  beforeEach(async () => {
    result = { ...identity };
    rateLimit = { ...allowed };
    requests = [];
    downstream = vi.fn<() => void>();
    authenticateRequest.mockImplementation(async () => result);
    extractBearerToken.mockImplementation((header) => {
      const parsed = parseAuthorizationHeader(header);
      return parsed?.normalizedScheme === 'bearer' ? parsed.token : null;
    });
    consume.mockImplementation(async () => rateLimit);
    keyFor.mockImplementation((bearer, ip) =>
      bearer ? 'synthetic-token-key' : `synthetic-ip-key:${ip}`,
    );
    const dependencies: McpAuthMiddlewareDependencies = {
      authService: { authenticateRequest, extractBearerToken },
      rateLimitService: { consume, keyFor },
    };
    const middleware = createMcpAuthMiddleware(dependencies);
    const app = express();
    app.use((req: McpRequest, _res, next) => {
      requests.push(req);
      next();
    });
    const handler: express.RequestHandler = (req: McpRequest, res) => {
      downstream();
      res.json({ authContext: req.authContext ?? null });
    };
    app.post(
      routes,
      express.json({ limit: '1mb' }),
      mcpAccessModeMiddleware,
      toolsetsQueryMiddleware,
      middleware,
      handler,
    );
    app.get(
      routes,
      mcpAccessModeMiddleware,
      toolsetsQueryMiddleware,
      middleware,
      handler,
    );
    app.delete(
      routes,
      mcpAccessModeMiddleware,
      toolsetsQueryMiddleware,
      middleware,
      handler,
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected loopback TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  function request(
    route = '/mcp',
    method = 'POST',
    bearer: string | null = token,
    rpcMethod = 'tools/call',
  ) {
    return fetch(`${baseUrl}${route}`, {
      ...(method === 'POST'
        ? { body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: rpcMethod }) }
        : {}),
      headers: {
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        'Content-Type': 'application/json',
      },
      method,
    });
  }

  function rejected(authCalls = 1, limiterCalls = 1) {
    expect(downstream).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.authContext).toBeUndefined();
    expect(authenticateRequest).toHaveBeenCalledTimes(authCalls);
    expect(consume).toHaveBeenCalledTimes(limiterCalls);
    expect(keyFor).toHaveBeenCalledTimes(limiterCalls);
  }

  it.each(cases)(
    'preserves upstream throttle on %s %s',
    async (route, method) => {
      result = {
        error: 'Too many requests',
        isRateLimited: true,
        retryAfterSeconds: 37,
        valid: false,
      };
      const response = await request(route, method);
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('37');
      expect(response.headers.get('www-authenticate')).toBeNull();
      await expect(response.json()).resolves.toEqual({
        error: {
          code: -32029,
          data: {
            code: 'rate_limited',
            message: 'Too many requests',
            retryAfterSeconds: 37,
          },
          message: 'Too many requests',
        },
        id: null,
        jsonrpc: '2.0',
      });
      expect(authenticateRequest).toHaveBeenCalledWith(token);
      expect(keyFor).toHaveBeenCalledWith(token, '127.0.0.1');
      expect(consume).toHaveBeenCalledWith('synthetic-token-key');
      rejected();
    },
  );

  it('uses the existing retry duration and guard message fallbacks', async () => {
    result = { isRateLimited: true, valid: false };
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe(
      String(AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS),
    );
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: -32029,
        data: {
          code: 'rate_limited',
          message: 'Rate limited by the Genfeed API',
          retryAfterSeconds: 5,
        },
      },
    });
    rejected();
  });

  it.each([
    'An active subscription is required',
    'Insufficient credits',
    '  Too many requests  ',
  ])(
    'retains classifier precedence and normalization for %s',
    async (message) => {
      result = {
        error: message,
        isRateLimited: true,
        retryAfterSeconds: 2.2,
        valid: false,
      };
      const response = await request();
      const classified = classifyMcpToolFailure({
        message,
        retryAfterSeconds: 2.2,
        status: 429,
      });
      expect(classified).not.toBeNull();
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('2.2');
      expect(response.headers.get('www-authenticate')).toBeNull();
      if (!classified) throw new Error('Expected classifier output');
      await expect(response.json()).resolves.toEqual(
        mcpJsonRpcError(null, -32029, classified),
      );
      rejected();
    },
  );

  for (const valid of [false, true]) {
    for (const isUnavailable of [false, true]) {
      for (const isRateLimited of [false, true]) {
        it.each(cases)(
          `preserves flag priority valid=${valid} unavailable=${isUnavailable} limited=${isRateLimited} on %s %s`,
          async (route, method) => {
            result = {
              ...identity,
              accessMode: route === '/mcp/claude' ? 'claude' : 'standard',
              isRateLimited,
              isUnavailable,
              retryAfterSeconds: 37,
              valid,
            };
            const response = await request(route, method);
            const status = isRateLimited
              ? 429
              : isUnavailable
                ? 503
                : valid
                  ? 200
                  : 401;
            expect(response.status).toBe(status);
            if (status === 200) {
              await expect(response.json()).resolves.toEqual({
                authContext: {
                  accessMode: result.accessMode,
                  organizationId: identity.organizationId,
                  role: 'admin',
                  token,
                  userId: identity.userId,
                },
              });
              expect(downstream).toHaveBeenCalledTimes(1);
              expect(authenticateRequest).toHaveBeenCalledTimes(1);
              expect(consume).toHaveBeenCalledTimes(1);
            } else {
              rejected();
              expect(response.headers.get('www-authenticate')).toBe(
                status === 401
                  ? getMcpWwwAuthenticateHeader(
                      route === '/mcp/claude' ? 'claude' : 'standard',
                    )
                  : null,
              );
              if (status === 503) {
                expect(response.headers.get('retry-after')).toBe('37');
                await expect(response.json()).resolves.toEqual({
                  error: {
                    code: -32002,
                    message:
                      'Genfeed could not verify your connection. Retry shortly.',
                  },
                  id: null,
                  jsonrpc: '2.0',
                });
              } else {
                await expect(response.json()).resolves.toMatchObject({
                  error: {
                    code: status === 429 ? -32029 : -32001,
                    data: {
                      code: status === 429 ? 'rate_limited' : 'unauthorized',
                    },
                  },
                  id: null,
                  jsonrpc: '2.0',
                });
              }
            }
          },
        );
      }
    }
  }

  it('allows a succeeding request after an upstream throttle exactly once', async () => {
    result = { isRateLimited: true, valid: false };
    expect((await request()).status).toBe(429);
    expect(requests[0]?.authContext).toBeUndefined();
    result = { ...identity };
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('retry-after')).toBeNull();
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      authContext: { userId: identity.userId },
    });
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(authenticateRequest).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('rejects a standard identity on the Claude connector', async () => {
    const response = await request('/mcp/claude');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      getMcpWwwAuthenticateHeader('claude'),
    );
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: -32001,
        message:
          'Authorize the Claude connector with its own browser OAuth connection. Existing standard tokens and manual API keys cannot be used here.',
      },
    });
    rejected();
  });

  it('preserves the default user role', async () => {
    result = { ...identity, role: undefined };
    await expect((await request()).json()).resolves.toMatchObject({
      authContext: { role: 'user' },
    });
    expect(downstream).toHaveBeenCalledTimes(1);
  });

  it('preserves unavailable fallback and invalid-token error responses', async () => {
    result = { isUnavailable: true, valid: false };
    const unavailable = await request();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('retry-after')).toBe('5');
    expect(unavailable.headers.get('www-authenticate')).toBeNull();
    expect(requests[0]?.authContext).toBeUndefined();
    result = { error: 'Invalid token format', valid: false };
    const invalid = await request();
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('www-authenticate')).toBe(
      getMcpWwwAuthenticateHeader('standard'),
    );
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: -32001, message: 'Invalid token format' },
    });
    expect(requests.every((req) => req.authContext === undefined)).toBe(true);
    expect(downstream).not.toHaveBeenCalled();
    expect(authenticateRequest).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it.each(routes)('allows tokenless public discovery on %s', async (route) => {
    const response = await request(route, 'POST', null, 'tools/list');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authContext: null });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(keyFor).toHaveBeenCalledWith(null, '127.0.0.1');
  });

  it.each(cases)(
    'challenges protected tokenless %s %s',
    async (route, method) => {
      const response = await request(route, method, null);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        getMcpWwwAuthenticateHeader(
          route === '/mcp/claude' ? 'claude' : 'standard',
        ),
      );
      await expect(response.json()).resolves.toMatchObject({
        error: { code: -32001, data: { code: 'unauthorized' } },
      });
      rejected(0);
    },
  );

  it.each([
    '/mcp?api_key=synthetic',
    '/mcp?access_token=synthetic',
    '/mcp/claude?api_key=synthetic',
  ])('rejects URL credentials before rate limiting on %s', async (route) => {
    const response = await request(route);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).not.toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: -32001,
        message: 'API credentials must be sent in the Authorization header',
      },
      id: null,
      jsonrpc: '2.0',
    });
    rejected(0, 0);
    expect(extractBearerToken).not.toHaveBeenCalled();
  });

  it.each([
    '/mcp?toolsets=unknown',
    '/mcp?profile=unknown',
    '/mcp/claude?profile=full',
    '/mcp/claude?toolsets=content',
  ])('rejects catalog query before authentication on %s', async (route) => {
    const response = await request(route, 'POST', null, 'tools/list');
    expect(response.status).toBe(400);
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(await response.json()).toHaveProperty('error');
    rejected(0, 0);
    expect(extractBearerToken).not.toHaveBeenCalled();
  });

  it.each(cases)(
    'preserves local limit rejection on %s %s',
    async (route, method) => {
      rateLimit = {
        ...allowed,
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 19,
      };
      const response = await request(route, method);
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('19');
      expect(response.headers.get('www-authenticate')).toBeNull();
      for (const prefix of ['RateLimit', 'X-RateLimit']) {
        expect(response.headers.get(`${prefix}-Limit`)).toBe('60');
        expect(response.headers.get(`${prefix}-Remaining`)).toBe('0');
        expect(response.headers.get(`${prefix}-Reset`)).toBe('1234567890');
      }
      await expect(response.json()).resolves.toEqual({
        error: {
          code: -32029,
          data: {
            code: 'rate_limited',
            message: 'Rate limit exceeded. Retry after 19s.',
            retryAfterSeconds: 19,
          },
          message: 'Rate limit exceeded. Retry after 19s.',
        },
        id: null,
        jsonrpc: '2.0',
      });
      rejected(0);
    },
  );

  it('preserves the POST one-megabyte body limit before auth', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(response.status).toBe(413);
    rejected(0, 0);
  });
});

describe('production authentication wiring', () => {
  it('creates one factory and mounts it after the existing query boundary for all methods', () => {
    const main = readFileSync(
      fileURLToPath(new URL('../../main.ts', import.meta.url)),
      'utf8',
    );
    expect(main.match(/createMcpAuthMiddleware\(/g)).toHaveLength(1);
    expect(main).toContain(
      'const mcpAuthMiddleware = createMcpAuthMiddleware({',
    );
    for (const method of ['post', 'get', 'delete']) {
      const registration = main.slice(
        main.indexOf(`expressApp.${method}(`),
        main.indexOf(
          `streamableHttpService.handle${method[0]?.toUpperCase()}${method.slice(1)}`,
        ),
      );
      expect(registration).toMatch(/\['\/mcp', '\/mcp\/claude'\]/);
      expect(registration).toMatch(
        /mcpAccessModeMiddleware,\s*toolsetsQueryMiddleware,\s*mcpAuthMiddleware,/,
      );
      if (method === 'post')
        expect(registration).toContain("express.json({ limit: '1mb' })");
    }
    expect(main).not.toContain('authenticateRequest(token)');
  });
});
