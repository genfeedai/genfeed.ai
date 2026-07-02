import { ConfigService } from '@clips/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
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

describe('InternalApiKeyGuard', () => {
  const logger = {
    warn: vi.fn(),
  } as unknown as LoggerService;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests with the configured bearer token', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: 'secret-token',
        isDevelopment: false,
      } as ConfigService,
      logger,
    );

    const result = guard.canActivate(
      createContext({
        headers: { authorization: 'Bearer secret-token' },
      }),
    );

    expect(result).toBe(true);
  });

  it('rejects missing bearer tokens', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: 'secret-token',
        isDevelopment: false,
      } as ConfigService,
      logger,
    );

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects malformed authorization headers (no Bearer scheme)', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: 'secret-token',
        isDevelopment: false,
      } as ConfigService,
      logger,
    );

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { authorization: 'secret-token' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects invalid bearer tokens', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: 'secret-token',
        isDevelopment: false,
      } as ConfigService,
      logger,
    );

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer wrong-token' },
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('allows development requests when no API key is configured', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: '',
        isDevelopment: true,
      } as ConfigService,
      logger,
    );

    const result = guard.canActivate(createContext({ headers: {} }));

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects production requests when no API key is configured', () => {
    const guard = new InternalApiKeyGuard(
      {
        API_KEY: '',
        isDevelopment: false,
      } as ConfigService,
      logger,
    );

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});
