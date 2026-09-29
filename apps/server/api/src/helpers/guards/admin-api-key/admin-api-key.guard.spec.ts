import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { ConfigService } from '@libs/config/config.service';
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

  describe('missing authorization header', () => {
    it('throws with descriptive message', () => {
      expect(() => guard.canActivate(makeContext())).toThrow(
        'Authorization header is required',
      );
    });
  });

  describe('malformed authorization header', () => {
    it.each([
      ['a valid-looking key', `Bearer ${VALID_KEY} extra`],
      ['an already-invalid key', 'Bearer wrong-key-here-xyz extra-field'],
    ])(
      'throws when the header has a surplus field after %s',
      (_label, authHeader) => {
        expect(() => guard.canActivate(makeContext(authHeader))).toThrow(
          new UnauthorizedException('Invalid authorization header format'),
        );
      },
    );
  });

  describe('missing server config', () => {
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
    it('uses timing-safe comparison (different length key rejected)', () => {
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${VALID_KEY}extra`)),
      ).toThrow(UnauthorizedException);
    });

    it.each([
      ['bearer', `bearer ${VALID_KEY}`],
      ['BEARER', `BEARER ${VALID_KEY}`],
      ['BeArEr', `BeArEr ${VALID_KEY}`],
    ])(
      // RFC 7235: scheme names are case-insensitive.
      'accepts a %s scheme',
      (_label, authorization) => {
        expect(guard.canActivate(makeContext(authorization))).toBe(true);
      },
    );
  });
});
