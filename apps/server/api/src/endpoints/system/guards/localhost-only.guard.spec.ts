import { LocalhostOnlyGuard } from '@api/endpoints/system/guards/localhost-only.guard';
import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

function makeContext({
  host = 'localhost:3001',
  ip = '127.0.0.1',
  origin,
  referer,
  forwardedFor,
  forwardedHost,
  path = '/v1/system/db-mode',
}: {
  forwardedFor?: string;
  forwardedHost?: string;
  host?: string;
  ip?: string;
  origin?: string;
  path?: string;
  referer?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          host,
          origin,
          referer,
          'x-forwarded-for': forwardedFor,
          'x-forwarded-host': forwardedHost,
        },
        hostname: host.split(':')[0],
        ip,
        path,
        socket: { remoteAddress: ip },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('LocalhostOnlyGuard', () => {
  let guard: LocalhostOnlyGuard;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalhostOnlyGuard,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get(LocalhostOnlyGuard);
    loggerService = module.get(LoggerService);
  });

  it('allows direct localhost requests', () => {
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('allows localhost origin requests when transport is local', () => {
    expect(
      guard.canActivate(
        makeContext({
          origin: 'http://localhost:3102',
        }),
      ),
    ).toBe(true);
  });

  it('allows forwarded localhost ip addresses', () => {
    expect(
      guard.canActivate(
        makeContext({
          forwardedFor: '::ffff:127.0.0.1',
          host: 'localhost:3001',
          ip: '10.10.10.10',
        }),
      ),
    ).toBe(true);
  });

  it('blocks non-local transport even with a spoofed localhost origin', () => {
    expect(() =>
      guard.canActivate(
        makeContext({
          host: 'api.genfeed.ai',
          ip: '52.10.10.10',
          origin: 'http://localhost:3102',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('logs when blocking a non-local request', () => {
    try {
      guard.canActivate(
        makeContext({
          host: 'api.genfeed.ai',
          ip: '52.10.10.10',
        }),
      );
    } catch {
      // expected
    }

    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Blocked non-local request'),
      expect.objectContaining({
        hostname: 'api.genfeed.ai',
        ip: '52.10.10.10',
      }),
    );
  });
});
