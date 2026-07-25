import type { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import {
  appendWebhookToken,
  assertWebhookToken,
} from '@server/webhooks/webhook-token.util';
import type { Request } from 'express';

describe('webhook-token.util', () => {
  const loggerService = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  function requestWith(options: {
    authorization?: string;
    token?: string;
    headerToken?: string;
  }): Request {
    return {
      headers: {
        ...(options.authorization
          ? { authorization: options.authorization }
          : {}),
        ...(options.headerToken
          ? { 'x-webhook-token': options.headerToken }
          : {}),
      },
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
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
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
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
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
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
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
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('accepts a matching bearer token when opted in', () => {
      expect(() =>
        assertWebhookToken({
          acceptBearerHeader: true,
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ authorization: 'Bearer s3cret' }),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).not.toThrow();
    });

    it('ignores a bearer token when not opted in', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ authorization: 'Bearer s3cret' }),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('ignores a non-bearer authorization scheme', () => {
      expect(() =>
        assertWebhookToken({
          acceptBearerHeader: true,
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ authorization: 'Basic s3cret' }),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a wrong bearer token with 401', () => {
      expect(() =>
        assertWebhookToken({
          acceptBearerHeader: true,
          configuredSecret: 's3cret',
          loggerService,
          request: requestWith({ authorization: 'Bearer wrong-token' }),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('rejects with 401 when no secret is configured', () => {
      expect(() =>
        assertWebhookToken({
          configuredSecret: undefined,
          loggerService,
          request: requestWith({}),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('TEST_WEBHOOK_SECRET'),
      );
    });

    it('rejects an otherwise-valid token when the secret is blank', () => {
      // The config schema allows an empty string, so a deployment can leave the
      // variable declared but unset. Blank must be treated as unconfigured,
      // otherwise a caller sending `?token=` would authenticate.
      expect(() =>
        assertWebhookToken({
          configuredSecret: '   ',
          loggerService,
          request: requestWith({ token: '   ' }),
          secretEnvVar: 'TEST_WEBHOOK_SECRET',
          url: 'test',
        }),
      ).toThrow(UnauthorizedException);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('TEST_WEBHOOK_SECRET'),
      );
    });

    it('does not leak configuration state to the caller', () => {
      // An anonymous caller must not be able to tell "no secret provisioned"
      // apart from "wrong secret" — both paths return the same message.
      const unconfigured = (() => {
        try {
          assertWebhookToken({
            configuredSecret: undefined,
            loggerService,
            request: requestWith({ token: 'guess' }),
            secretEnvVar: 'TEST_WEBHOOK_SECRET',
            url: 'test',
          });
        } catch (error: unknown) {
          return (error as Error).message;
        }
      })();

      const wrongSecret = (() => {
        try {
          assertWebhookToken({
            configuredSecret: 's3cret',
            loggerService,
            request: requestWith({ token: 'guess' }),
            secretEnvVar: 'TEST_WEBHOOK_SECRET',
            url: 'test',
          });
        } catch (error: unknown) {
          return (error as Error).message;
        }
      })();

      expect(unconfigured).toBe(wrongSecret);
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
