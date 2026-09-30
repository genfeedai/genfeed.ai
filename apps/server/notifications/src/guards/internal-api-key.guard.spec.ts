import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import type { Request } from 'express';
import { InternalApiKeyGuard } from './internal-api-key.guard';

const createContext = (request: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request as Request,
    }),
  }) as ExecutionContext;

describe('InternalApiKeyGuard', () => {
  const logger = { warn: vi.fn() } as unknown as LoggerService;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests with the configured bearer token', () => {
    const guard = new InternalApiKeyGuard(
      {
        get: vi.fn().mockReturnValue('secret-token'),
        isDevelopment: false,
      } as unknown as ConfigService,
      logger,
    );

    expect(
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer secret-token' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects invalid bearer tokens', () => {
    const guard = new InternalApiKeyGuard(
      {
        get: vi.fn().mockReturnValue('secret-token'),
        isDevelopment: false,
      } as unknown as ConfigService,
      logger,
    );

    expect(() =>
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer wrong-token' } }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('fails closed outside development when the key is missing', () => {
    const guard = new InternalApiKeyGuard(
      {
        get: vi.fn().mockReturnValue(undefined),
        isDevelopment: false,
      } as unknown as ConfigService,
      logger,
    );

    expect(() => guard.canActivate(createContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows the documented development bypass when the key is missing', () => {
    const guard = new InternalApiKeyGuard(
      {
        get: vi.fn().mockReturnValue(undefined),
        isDevelopment: true,
      } as unknown as ConfigService,
      logger,
    );

    expect(guard.canActivate(createContext({ headers: {} }))).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String));
  });
});
