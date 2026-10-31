import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { InternalCallers } from '@api/helpers/guards/admin-api-key/internal-callers.decorator';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

@InternalCallers('discord', 'slack')
class BotRoutes {}

@InternalCallers('notifications')
class NotificationsRoutes {}

class UndeclaredRoutes {}

const makeContext = (
  authHeader?: string,
  routes: new () => object = BotRoutes,
): ExecutionContext =>
  ({
    getClass: () => routes,
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminApiKeyGuard', () => {
  let guard: AdminApiKeyGuard;
  let keys: Record<string, string | undefined>;
  let logger: vi.Mocked<Pick<LoggerService, 'error'>>;

  const SHARED_KEY = 'super-secret-admin-key-1234';
  const DISCORD_KEY = 'discord-only-key-5678';
  const SLACK_KEY = 'slack-only-key-9012';
  const NOTIFICATIONS_KEY = 'notifications-only-key-3456';

  beforeEach(async () => {
    keys = { GENFEEDAI_API_KEY: SHARED_KEY };
    logger = { error: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminApiKeyGuard,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => keys[key] },
        },
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

    it.each([
      ['a valid-looking key', `Bearer ${SHARED_KEY} extra`],
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
    it('throws UnauthorizedException when no key is configured', () => {
      keys = {};
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${SHARED_KEY}`)),
      ).toThrow(UnauthorizedException);
    });

    it('logs error when no key is configured', () => {
      keys = {};
      try {
        guard.canActivate(makeContext(`Bearer ${SHARED_KEY}`));
      } catch {
        // expected
      }
      expect(logger.error).toHaveBeenCalledWith(
        'No internal API key configured for route callers',
      );
    });

    it('rejects every key on a route that declares no callers', () => {
      expect(() =>
        guard.canActivate(
          makeContext(`Bearer ${SHARED_KEY}`, UndeclaredRoutes),
        ),
      ).toThrow(new UnauthorizedException('Server configuration error'));
      expect(logger.error).toHaveBeenCalledWith(
        'Route has no @InternalCallers declared',
      );
    });
  });

  describe('key validation', () => {
    it('returns true for the shared key while callers have no key of their own', () => {
      expect(guard.canActivate(makeContext(`Bearer ${SHARED_KEY}`))).toBe(true);
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
        guard.canActivate(makeContext(`Bearer ${SHARED_KEY}extra`)),
      ).toThrow(UnauthorizedException);
    });

    it.each([
      ['bearer', `bearer ${SHARED_KEY}`],
      ['BEARER', `BEARER ${SHARED_KEY}`],
      ['BeArEr', `BeArEr ${SHARED_KEY}`],
    ])(
      // RFC 7235: scheme names are case-insensitive.
      'accepts a %s scheme',
      (_label, authorization) => {
        expect(guard.canActivate(makeContext(authorization))).toBe(true);
      },
    );
  });

  describe('per-caller keys', () => {
    beforeEach(() => {
      keys = {
        GENFEEDAI_API_KEY: SHARED_KEY,
        GENFEEDAI_API_KEY_DISCORD: DISCORD_KEY,
        GENFEEDAI_API_KEY_NOTIFICATIONS: NOTIFICATIONS_KEY,
        GENFEEDAI_API_KEY_SLACK: SLACK_KEY,
      };
    });

    it('accepts the key of each caller the route allows', () => {
      expect(guard.canActivate(makeContext(`Bearer ${DISCORD_KEY}`))).toBe(
        true,
      );
      expect(guard.canActivate(makeContext(`Bearer ${SLACK_KEY}`))).toBe(true);
    });

    it('rejects the key of a service the route does not allow', () => {
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${NOTIFICATIONS_KEY}`)),
      ).toThrow(new UnauthorizedException('Invalid admin API key'));
      expect(() =>
        guard.canActivate(
          makeContext(`Bearer ${DISCORD_KEY}`, NotificationsRoutes),
        ),
      ).toThrow(new UnauthorizedException('Invalid admin API key'));
    });

    it('rejects the shared key once every allowed caller has its own', () => {
      expect(() =>
        guard.canActivate(makeContext(`Bearer ${SHARED_KEY}`)),
      ).toThrow(new UnauthorizedException('Invalid admin API key'));
    });

    it('still accepts the shared key for an allowed caller that has no key of its own', () => {
      keys.GENFEEDAI_API_KEY_SLACK = undefined;
      expect(guard.canActivate(makeContext(`Bearer ${SHARED_KEY}`))).toBe(true);
      expect(guard.canActivate(makeContext(`Bearer ${DISCORD_KEY}`))).toBe(
        true,
      );
    });
  });
});
