import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import * as clerkUtil from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getIsSuperAdmin: vi.fn(),
  getStripeSubscriptionStatus: vi.fn(),
  getSubscriptionTier: vi.fn(),
}));

function buildContext(user?: User | null): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function buildUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: 'user_123',
    publicMetadata: metadata,
  } as unknown as User;
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
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    guard = module.get(SubscriptionGuard);

    vi.mocked(clerkUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue('');
    vi.mocked(clerkUtil.getSubscriptionTier).mockReturnValue('');
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

  it('allows super admins regardless of subscription status', () => {
    vi.mocked(clerkUtil.getIsSuperAdmin).mockReturnValue(true);
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows API key users without subscription metadata', () => {
    const ctx = buildContext(buildUser({ isApiKey: true }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with ACTIVE subscription', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.ACTIVE,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with TRIALING subscription', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.TRIALING,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows users with BYOK tier regardless of subscription status', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELED,
    );
    vi.mocked(clerkUtil.getSubscriptionTier).mockReturnValue(
      SubscriptionTier.BYOK,
    );
    const ctx = buildContext(buildUser());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 when subscription is inactive', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELED,
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
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.PAST_DUE,
    );
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('logs warning before throwing 403', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue('none');
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SubscriptionGuard: No active subscription',
      expect.objectContaining({ userId: 'user_123' }),
    );
  });

  it('throws 403 when no subscription status set', () => {
    vi.mocked(clerkUtil.getStripeSubscriptionStatus).mockReturnValue('');
    vi.mocked(clerkUtil.getSubscriptionTier).mockReturnValue('');
    const ctx = buildContext(buildUser());
    expect(() => guard.canActivate(ctx)).toThrow(
      new HttpException(expect.anything(), HttpStatus.FORBIDDEN),
    );
  });
});
