import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import * as authProviderUtil from '@api/helpers/utils/auth/auth.util';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: vi.fn(),
  getStripeSubscriptionStatus: vi.fn(),
  getSubscriptionTier: vi.fn(),
}));

function buildContext(
  user?: User | null,
  creditsConfig?: CreditsConfig,
): ExecutionContext {
  const handler = () => {};
  if (creditsConfig)
    Reflect.defineMetadata(CREDITS_KEY, creditsConfig, handler);
  const request = { user };
  return {
    getClass: () => SubscriptionGuard,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_123',
    isSuperAdmin: false,
    userId: 'user_123',
    ...overrides,
  };
}

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        Reflector,
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    guard = module.get(SubscriptionGuard);

    vi.mocked(authProviderUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue('');
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('throws 401 when no user in request', () => {
    const ctx = buildContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(
      new HttpException(
        { detail: 'Authentication required', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      ),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SubscriptionGuard: No user found in request',
    );
  });

  it('throws 401 when user is undefined', () => {
    const ctx = buildContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('defers authenticated Free metered requests to credit admission', () => {
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue(
      SubscriptionTier.FREE,
    );
    const ctx = buildContext(buildUser(), { amount: 10 });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(authProviderUtil.getStripeSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('requires authentication even when the route has credits metadata', () => {
    expect(() =>
      guard.canActivate(buildContext(undefined, { amount: 10 })),
    ).toThrow(
      new HttpException(
        { detail: 'Authentication required', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      ),
    );
  });

  it('resolves class credits metadata with handler metadata taking precedence', () => {
    class MeteredController {}
    const handler = () => {};
    Reflect.defineMetadata(CREDITS_KEY, { amount: 10 }, MeteredController);
    const ctx = buildContext(buildUser());
    ctx.getClass = () => MeteredController;
    ctx.getHandler = () => handler;
    expect(guard.canActivate(ctx)).toBe(true);
    Reflect.defineMetadata(CREDITS_KEY, { amount: 20 }, handler);
    const assertActive = vi.spyOn(guard, 'assertActive');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(assertActive).toHaveBeenCalledWith(expect.anything(), {
      amount: 20,
    });
  });

  it('allows super admins regardless of subscription status', () => {
    vi.mocked(authProviderUtil.getIsSuperAdmin).mockReturnValue(true);
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows API key users without subscription metadata', () => {
    const ctx = buildContext(buildUser({ isApiKey: true }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with ACTIVE subscription', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.ACTIVE,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with TRIALING subscription', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.TRIALING,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with BYOK tier regardless of subscription status', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELLED,
    );
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue(
      SubscriptionTier.BYOK,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 when subscription is inactive', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELLED,
    );
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow(
      new HttpException(
        {
          detail:
            'An active subscription is required to use this feature. Please subscribe to a plan.',
          title: 'Active subscription required',
        },
        HttpStatus.FORBIDDEN,
      ),
    );
  });

  it('throws 403 with PAST_DUE subscription', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.PAST_DUE,
    );
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('logs warning before throwing 403', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      'none',
    );
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SubscriptionGuard: No active subscription',
      expect.objectContaining({ userId: 'user_123' }),
    );
  });

  it('throws 403 when no subscription status set', () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue('');
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue('');
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow(
      new HttpException(expect.anything(), HttpStatus.FORBIDDEN),
    );
  });
});
