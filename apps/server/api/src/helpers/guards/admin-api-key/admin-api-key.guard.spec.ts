import { ConfigService } from '@api/config/config.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const makeContext = (authHeader?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminApiKeyGuard', () => {
  let guard: AdminApiKeyGuard;
  let configService: vi.Mocked<Pick<ConfigService, 'get'>>;
  let logger: vi.Mocked<Pick<LoggerService, 'error'>>;

  const VALID_KEY = 'super-secret-admin-key-1234';

  beforeEach(async () => {
    configService = { get: vi.fn().mockReturnValue(VALID_KEY) };
    logger = { error: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminApiKeyGuard,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    guard = module.get<AdminApiKeyGuard>(AdminApiKeyGuard);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('missing authorization header', () => {
    it('throws UnauthorizedException when header is absent', () => {
      expect(() => guard.canActivate(makeContext())).toThrow(
        UnauthorizedException,
      );
    });

    it('throws with descriptive message', () => {
      expect(() => guard.canActivate(makeContext())).toThrow(
        'Authorization header is required',
      );
    });
  });

  describe('malformed authorization header', () => {
    it('throws when type is not Bearer', () => {
      expect(() => guard.canActivate(makeContext('Basic abc123'))).toThrow(
        UnauthorizedException,
      );
    });

    it('throws when token is missing after Bearer', () => {
      expect(() => guard.canActivate(makeContext('Bearer'))).toThrow(
        UnauthorizedException,
      );
    });

    it('throws with invalid format message', () => {
      expect(() => guard.canActivate(makeContext('Basic abc'))).toThrow(
        'Invalid authorization header format',
      );
    });
  });

  describe('missing server config', () => {
    it('throws UnauthorizedException when GENFEEDAI_API_KEY not configured', () => {
      configService.get.mockReturnValue(undefined);
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${VALID_KEY}`)),
      ).toThrow(UnauthorizedException);
    });

    it('logs error when key not configured', () => {
      configService.get.mockReturnValue(undefined);
      try {
        guard.canActivate(makeContext(`Bearer ${VALID_KEY}`));
      } catch {
        // expected
      }
      expect(logger.error).toHaveBeenCalledWith(
        'GENFEEDAI_API_KEY not configured',
      );
    });
  });

  describe('key validation', () => {
    it('returns true for correct API key', () => {
      expect(guard.canActivate(makeContext(`Bearer ${VALID_KEY}`))).toBe(true);
    });

    it('throws for incorrect API key', () => {
      expect(() =>
        guard.canActivate(makeContext('Bearer wrong-key-here-xyz')),
      ).toThrow(UnauthorizedException);
    });

    it('throws with invalid key message', () => {
      expect(() => guard.canActivate(makeContext('Bearer bad-key'))).toThrow(
        'Invalid admin API key',
      );
    });

    it('uses timing-safe comparison (different length key rejected)', () => {
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${VALID_KEY}extra`)),
      ).toThrow(UnauthorizedException);
    });
  });
});
