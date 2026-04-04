import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

function makeContext(ip: string, path = '/admin/crm'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        path,
        socket: { remoteAddress: ip },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('IpWhitelistGuard', () => {
  let guard: IpWhitelistGuard;
  let loggerService: vi.Mocked<LoggerService>;

  const originalEnv = process.env.ADMIN_ALLOWED_IPS;

  afterEach(() => {
    process.env.ADMIN_ALLOWED_IPS = originalEnv;
  });

  async function buildGuard(): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpWhitelistGuard,
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

    guard = module.get<IpWhitelistGuard>(IpWhitelistGuard);
    loggerService = module.get(LoggerService);
  }

  it('should be defined', async () => {
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
    await buildGuard();
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow requests from whitelisted IPs', async () => {
      process.env.ADMIN_ALLOWED_IPS = '127.0.0.1,192.168.1.1';
      await buildGuard();

      const ctx = makeContext('127.0.0.1');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow requests from second IP in whitelist', async () => {
      process.env.ADMIN_ALLOWED_IPS = '10.0.0.1,192.168.1.100';
      await buildGuard();

      const ctx = makeContext('192.168.1.100');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should block requests from non-whitelisted IPs', async () => {
      process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
      await buildGuard();

      const ctx = makeContext('192.168.99.99');
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Access denied');
    });

    it('should block all requests when ADMIN_ALLOWED_IPS is empty', async () => {
      process.env.ADMIN_ALLOWED_IPS = '';
      await buildGuard();

      const ctx = makeContext('127.0.0.1');
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should log a warning when ADMIN_ALLOWED_IPS is empty', async () => {
      process.env.ADMIN_ALLOWED_IPS = '';
      await buildGuard();

      const ctx = makeContext('1.2.3.4');
      try {
        guard.canActivate(ctx);
      } catch {
        // expected
      }

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('ADMIN_ALLOWED_IPS is empty'),
      );
    });

    it('should log a warning when blocking a non-whitelisted IP', async () => {
      process.env.ADMIN_ALLOWED_IPS = '10.0.0.1';
      await buildGuard();

      const ctx = makeContext('99.99.99.99', '/admin/crm/leads');
      try {
        guard.canActivate(ctx);
      } catch {
        // expected
      }

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked request from 99.99.99.99'),
      );
    });

    it('should normalize IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)', async () => {
      process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
      await buildGuard();

      const ctx = makeContext('::ffff:127.0.0.1');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should handle IPs with whitespace in ADMIN_ALLOWED_IPS', async () => {
      process.env.ADMIN_ALLOWED_IPS = '  10.0.0.5  , 172.16.0.1  ';
      await buildGuard();

      const ctx1 = makeContext('10.0.0.5');
      expect(guard.canActivate(ctx1)).toBe(true);

      const ctx2 = makeContext('172.16.0.1');
      expect(guard.canActivate(ctx2)).toBe(true);
    });
  });
});
