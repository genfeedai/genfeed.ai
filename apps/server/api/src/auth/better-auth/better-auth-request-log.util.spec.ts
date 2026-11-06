import { EventEmitter } from 'node:events';
import {
  attachBetterAuthRequestLog,
  type BetterAuthRequestLogger,
  createBetterAuthRequestLogPayload,
  logBetterAuthResponse,
  sanitizeBetterAuthLogPath,
} from '@api/auth/better-auth/better-auth-request-log.util';
import { beforeEach, describe, expect, it } from 'vitest';

let lines: Array<{ level: string; message: string; payload: unknown }>;
const logger = {
  error: (message: string, payload: unknown) => {
    lines.push({ level: 'error', message, payload });
  },
  warn: (message: string, payload: unknown) => {
    lines.push({ level: 'warn', message, payload });
  },
} as unknown as BetterAuthRequestLogger;

beforeEach(() => {
  lines = [];
});

describe('sanitizeBetterAuthLogPath', () => {
  it.each([
    [
      '/v1/auth/magic-link/verify?token=aGaBbdnmaRCxtCMzgEyMYNckdOecENYi&callbackURL=/agent',
      '/v1/auth/magic-link/verify',
    ],
    ['/v1/auth/get-session#frag', '/v1/auth/get-session'],
    ['/v1/auth/token?', '/v1/auth/token'],
    ['?token=secret', '/'],
  ])('reduces %s to %s', (input, expected) => {
    expect(sanitizeBetterAuthLogPath(input)).toBe(expected);
  });
});

describe('createBetterAuthRequestLogPayload', () => {
  it('normalizes the method and keeps the sanitized path', () => {
    expect(
      createBetterAuthRequestLogPayload(
        'get',
        '/v1/auth/token?cookie=secret',
        401,
        12,
      ),
    ).toEqual({
      durationMs: 12,
      method: 'GET',
      path: '/v1/auth/token',
      statusCode: 401,
    });
  });
});

describe('logBetterAuthResponse', () => {
  it.each([
    [401, 'warn'],
    [403, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('logs a %i at %s without the query string', (statusCode, level) => {
    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload(
        'GET',
        '/v1/auth/get-session?token=secret',
        statusCode,
        8,
      ),
    );

    expect(lines).toEqual([
      {
        level,
        message: 'Better Auth request failed',
        payload: {
          durationMs: 8,
          method: 'GET',
          path: '/v1/auth/get-session',
          statusCode,
        },
      },
    ]);
  });

  it.each([200, 302])('does not log a %i response', (statusCode) => {
    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload(
        'GET',
        '/v1/auth/get-session',
        statusCode,
        4,
      ),
    );

    expect(lines).toEqual([]);
  });
});

describe('attachBetterAuthRequestLog', () => {
  it('logs the finished status from the Express response', () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });

    attachBetterAuthRequestLog(
      {
        method: 'GET',
        originalUrl: '/v1/auth/token?session=hashed-secret',
        url: '/token?session=hashed-secret',
      },
      res,
      logger,
    );
    res.statusCode = 401;

    expect(lines).toEqual([]);
    res.emit('finish');
    res.emit('finish');
    expect(lines).toEqual([
      {
        level: 'warn',
        message: 'Better Auth request failed',
        payload: {
          durationMs: expect.any(Number),
          method: 'GET',
          path: '/v1/auth/token',
          statusCode: 401,
        },
      },
    ]);
  });
});
