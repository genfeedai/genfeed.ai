import { describe, expect, it, vi } from 'vitest';
import {
  attachBetterAuthRequestLog,
  createBetterAuthRequestLogPayload,
  logBetterAuthResponse,
  sanitizeBetterAuthLogPath,
} from './better-auth-request-log.util';

describe('sanitizeBetterAuthLogPath', () => {
  it('strips query strings so magic-link tokens never reach logs', () => {
    expect(
      sanitizeBetterAuthLogPath(
        '/v1/auth/magic-link/verify?token=aGaBbdnmaRCxtCMzgEyMYNckdOecENYi&callbackURL=/agent',
      ),
    ).toBe('/v1/auth/magic-link/verify');
  });

  it('strips hash fragments and empty query markers', () => {
    expect(sanitizeBetterAuthLogPath('/v1/auth/get-session#frag')).toBe(
      '/v1/auth/get-session',
    );
    expect(sanitizeBetterAuthLogPath('/v1/auth/token?')).toBe('/v1/auth/token');
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
  it('warns on 401 and 403 without logging the query string', () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload(
        'GET',
        '/v1/auth/get-session?token=secret',
        401,
        8,
      ),
    );

    expect(logger.warn).toHaveBeenCalledWith('Better Auth request failed', {
      durationMs: 8,
      method: 'GET',
      path: '/v1/auth/get-session',
      statusCode: 401,
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('errors on 5xx', () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload(
        'POST',
        '/v1/auth/sign-in/magic-link',
        500,
        3,
      ),
    );

    expect(logger.error).toHaveBeenCalledWith('Better Auth request failed', {
      durationMs: 3,
      method: 'POST',
      path: '/v1/auth/sign-in/magic-link',
      statusCode: 500,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not log successful Better Auth responses', () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    logBetterAuthResponse(
      logger,
      createBetterAuthRequestLogPayload('GET', '/v1/auth/get-session', 200, 4),
    );

    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('attachBetterAuthRequestLog', () => {
  it('logs the finished status from the Express response', () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    const finishListeners: Array<() => void> = [];
    const res = {
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'finish') {
          finishListeners.push(listener);
        }
        return res;
      }),
      statusCode: 401,
    };

    attachBetterAuthRequestLog(
      {
        method: 'GET',
        originalUrl: '/v1/auth/token?session=hashed-secret',
        url: '/token?session=hashed-secret',
      },
      res,
      logger,
    );

    expect(logger.warn).not.toHaveBeenCalled();
    finishListeners[0]?.();
    expect(logger.warn).toHaveBeenCalledWith('Better Auth request failed', {
      durationMs: expect.any(Number),
      method: 'GET',
      path: '/v1/auth/token',
      statusCode: 401,
    });
  });
});
