import type { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import {
  appendWebhookToken,
  assertWebhookToken,
} from '@server/webhooks/webhook-token.util';
import type { Request } from 'express';

describe('webhook-token.util', () => {
  const loggerService = { warn: vi.fn() } as unknown as LoggerService;

  function requestWith(options: {
    token?: string;
    headerToken?: string;
  }): Request {
    return {
      headers: options.headerToken
        ? { 'x-webhook-token': options.headerToken }
        : {},
      query: options.token ? { token: options.token } : {},
    } as unknown as Request;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertWebhookToken', () => {
    it('accepts a matching query token', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ token: 's3cret' }),
          url: 'test',
        }),
      ).not.toThrow();
    });

    it('accepts a matching header token', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ headerToken: 's3cret' }),
          url: 'test',
        }),
      ).not.toThrow();
    });

    it('rejects a missing token with 401', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({}),
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a wrong token with 401', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ token: 'wrong-token' }),
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('warns and accepts when no secret is configured', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: undefined,
          loggerService,
          request: requestWith({}),
          url: 'test',
        }),
      ).not.toThrow();

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not configured'),
      );
    });
  });

  describe('appendWebhookToken', () => {
    it('appends as first query param', () => {
      expect(appendWebhookToken('https://x.dev/cb', 'abc')).toBe(
        'https://x.dev/cb?token=abc',
      );
    });

    it('appends with & when a query already exists', () => {
      expect(appendWebhookToken('https://x.dev/cb?a=1', 'abc')).toBe(
        'https://x.dev/cb?a=1&token=abc',
      );
    });

    it('returns the URL untouched without a secret', () => {
      expect(appendWebhookToken('https://x.dev/cb', undefined)).toBe(
        'https://x.dev/cb',
      );
    });

    it('url-encodes the secret', () => {
      expect(appendWebhookToken('https://x.dev/cb', 'a b&c')).toBe(
        'https://x.dev/cb?token=a%20b%26c',
      );
    });
  });
});
