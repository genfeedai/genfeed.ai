import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { InternalApiKeyGuard } from './internal-api-key.guard';

const createContext = (request: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request as Request,
    }),
  }) as ExecutionContext;

describe('InternalApiKeyGuard (shared @libs/auth core)', () => {
  const logger = {
    warn: vi.fn(),
  } as unknown as LoggerService;

  afterEach(() => {
    vi.clearAllMocks();
  });

  const buildGuard = (configuredKey: string, isDevelopment: boolean) =>
    new InternalApiKeyGuard({
      devBypassLogMessage: 'test dev bypass message',
      getConfiguredKey: () => configuredKey,
      isDevelopment: () => isDevelopment,
      logger,
    });

  it('allows requests with the configured bearer token', () => {
    const guard = buildGuard('secret-token', false);

    const result = guard.canActivate(
      createContext({
        headers: { authorization: 'Bearer secret-token' },
      }),
    );

    expect(result).toBe(true);
  });

  it('rejects missing bearer tokens', () => {
    const guard = buildGuard('secret-token', false);

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects malformed authorization headers (no Bearer scheme)', () => {
    const guard = buildGuard('secret-token', false);

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { authorization: 'secret-token' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a bearer token with surplus fields', () => {
    // Regression coverage for #5206: a naive `startsWith`/`slice` parse kept
    // everything after "Bearer ", including surplus fields, as one opaque
    // token that failed the timing-safe compare rather than being rejected
    // outright as a malformed header.
    const guard = buildGuard('secret-token', false);

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer secret-token extra' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it.each([
    ['bearer', 'bearer secret-token'],
    ['BEARER', 'BEARER secret-token'],
    ['BeArEr', 'BeArEr secret-token'],
  ])(
    // RFC 7235: scheme names are case-insensitive.
    'accepts a %s scheme',
    (_label, authorization) => {
      const guard = buildGuard('secret-token', false);

      const result = guard.canActivate(
        createContext({ headers: { authorization } }),
      );

      expect(result).toBe(true);
    },
  );

  it('rejects invalid bearer tokens (timing-safe mismatch)', () => {
    const guard = buildGuard('secret-token', false);

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer wrong-token' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('allows development requests when no API key is configured (dev bypass on)', () => {
    const guard = buildGuard('', true);

    const result = guard.canActivate(createContext({ headers: {} }));

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('test dev bypass message');
  });

  it('rejects production requests when no API key is configured (dev bypass off)', () => {
    const guard = buildGuard('', false);

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});
