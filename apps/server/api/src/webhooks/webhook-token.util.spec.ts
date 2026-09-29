import type { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { appendWebhookToken, assertWebhookToken } from './webhook-token.util';

type RequestShape = {
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
};

function makeRequest(shape: RequestShape = {}): Request {
  return {
    headers: shape.headers ?? {},
    query: shape.query ?? {},
  } as unknown as Request;
}

describe('assertWebhookToken', () => {
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const baseOptions = {
    loggerService,
    secretEnvVar: 'KLING_WEBHOOK_SECRET',
    url: '/webhooks/kling',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed and logs the variable to set when no secret is configured', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: undefined,
        request: makeRequest({ query: { token: 'anything' } }),
      }),
    ).toThrowError(UnauthorizedException);

    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('KLING_WEBHOOK_SECRET is not configured'),
    );
  });

  it('treats a blank configured secret as unset', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: '   ',
        request: makeRequest({ query: { token: '   ' } }),
      }),
    ).toThrowError('Invalid webhook token');
    expect(loggerService.error).toHaveBeenCalledTimes(1);
  });
});

describe('appendWebhookToken', () => {
  it('returns the URL untouched when no secret is configured', () => {
    expect(appendWebhookToken('https://api.test/hook', undefined)).toBe(
      'https://api.test/hook',
    );
    expect(appendWebhookToken('https://api.test/hook', '')).toBe(
      'https://api.test/hook',
    );
  });

  it('appends the token with an & when the URL already has a query', () => {
    expect(appendWebhookToken('https://api.test/hook?a=1', 'abc')).toBe(
      'https://api.test/hook?a=1&token=abc',
    );
  });
});
