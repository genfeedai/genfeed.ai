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

  it('accepts the secret from the token query parameter', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({ query: { token: 'super-secret' } }),
      }),
    ).not.toThrow();
  });

  it('accepts the secret from the x-webhook-token header', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { 'x-webhook-token': 'super-secret' },
        }),
      }),
    ).not.toThrow();
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

  it('rejects a request that carries no credential', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest(),
      }),
    ).toThrowError('Missing webhook token');
  });

  it('rejects a credential of the wrong length without leaking timing', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({ query: { token: 'short' } }),
      }),
    ).toThrowError('Invalid webhook token');
  });

  it('rejects a same-length credential that does not match', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({ query: { token: 'super-secrez' } }),
      }),
    ).toThrowError('Invalid webhook token');
  });

  it('ignores the Authorization header unless the vendor opts in', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { authorization: 'Bearer super-secret' },
        }),
      }),
    ).toThrowError('Missing webhook token');
  });

  it('accepts a bearer credential when the vendor opts in', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        acceptBearerHeader: true,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { authorization: 'Bearer super-secret' },
        }),
      }),
    ).not.toThrow();
  });

  it('matches the bearer scheme case-insensitively and trims the token', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        acceptBearerHeader: true,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { authorization: 'bEaReR super-secret ' },
        }),
      }),
    ).not.toThrow();
  });

  it('rejects a non-bearer Authorization scheme even when opted in', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        acceptBearerHeader: true,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { authorization: 'Basic super-secret' },
        }),
      }),
    ).toThrowError('Missing webhook token');
  });

  it('rejects an empty Authorization header when opted in', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        acceptBearerHeader: true,
        configuredSecret: 'super-secret',
        request: makeRequest({ headers: { authorization: '' } }),
      }),
    ).toThrowError('Missing webhook token');
  });

  it('rejects a bearer scheme with a blank token when opted in', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        acceptBearerHeader: true,
        configuredSecret: 'super-secret',
        request: makeRequest({ headers: { authorization: 'Bearer    ' } }),
      }),
    ).toThrowError('Missing webhook token');
  });

  it('prefers the query parameter over the header', () => {
    expect(() =>
      assertWebhookToken({
        ...baseOptions,
        configuredSecret: 'super-secret',
        request: makeRequest({
          headers: { 'x-webhook-token': 'wrong-secret' },
          query: { token: 'super-secret' },
        }),
      }),
    ).not.toThrow();
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

  it('appends the token with a ? on a bare URL', () => {
    expect(appendWebhookToken('https://api.test/hook', 'abc')).toBe(
      'https://api.test/hook?token=abc',
    );
  });

  it('appends the token with an & when the URL already has a query', () => {
    expect(appendWebhookToken('https://api.test/hook?a=1', 'abc')).toBe(
      'https://api.test/hook?a=1&token=abc',
    );
  });

  it('URL-encodes secrets containing reserved characters', () => {
    expect(appendWebhookToken('https://api.test/hook', 'a b&c=d')).toBe(
      'https://api.test/hook?token=a%20b%26c%3Dd',
    );
  });
});
