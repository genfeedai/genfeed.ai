import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ORGANIZATION_MODULE_KEY } from '@api/common/organization-modules/organization-module.decorator';
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

const billing = vi.hoisted(() => ({ isEnabled: true }));

vi.mock('@genfeedai/config', () => ({
  hasOrganizationBilling: () => billing.isEnabled,
}));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: vi.fn(),
  getStripeSubscriptionStatus: vi.fn(),
  getSubscriptionTier: vi.fn(),
}));

function buildContext(
  user?: User | null,
  creditsConfig?: CreditsConfig,
  moduleId?: string,
): ExecutionContext {
  const handler = () => {};
  if (creditsConfig)
    Reflect.defineMetadata(CREDITS_KEY, creditsConfig, handler);
  if (moduleId)
    Reflect.defineMetadata(ORGANIZATION_MODULE_KEY, { moduleId }, handler);
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
    organizationId: 'org_123',
    userId: 'user_123',
    ...overrides,
  };
}

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
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

    billing.isEnabled = true;
    getOrganizationCreditsBalance = vi.fn().mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        Reflector,
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: CreditsUtilsService,
          useValue: { getOrganizationCreditsBalance },
        },
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

  it('should be defined', async () => {
    expect(guard).toBeDefined();
  });

  it('throws 401 when no user in request', async () => {
    const ctx = buildContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new HttpException(
        { detail: 'Authentication required', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      ),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SubscriptionGuard: No user found in request',
    );
  });

  it('throws 401 when user is undefined', async () => {
    const ctx = buildContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('defers authenticated Free metered requests to credit admission', async () => {
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue(
      SubscriptionTier.FREE,
    );
    const ctx = buildContext(buildUser(), {
      amount: 10,
      description: 'Metered request',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authProviderUtil.getStripeSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('requires authentication even when the route has credits metadata', async () => {
    await expect(
      guard.canActivate(
        buildContext(undefined, { amount: 10, description: 'Metered request' }),
      ),
    ).rejects.toThrow(
      new HttpException(
        { detail: 'Authentication required', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      ),
    );
  });

  it('resolves class credits metadata with handler metadata taking precedence', async () => {
    class MeteredController {}
    const handler = () => {};
    Reflect.defineMetadata(CREDITS_KEY, { amount: 10 }, MeteredController);
    const ctx = {
      ...buildContext(buildUser()),
      getClass: () => MeteredController,
      getHandler: () => handler,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    Reflect.defineMetadata(CREDITS_KEY, { amount: 20 }, handler);
    const assertActive = vi.spyOn(guard, 'assertActive');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(assertActive).toHaveBeenCalledWith(
      expect.anything(),
      { amount: 20 },
      undefined,
    );
  });

  it('allows super admins regardless of subscription status', async () => {
    vi.mocked(authProviderUtil.getIsSuperAdmin).mockReturnValue(true);
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows API key users without subscription metadata', async () => {
    const ctx = buildContext(buildUser({ isApiKey: true }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows users with ACTIVE subscription', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.ACTIVE,
    );
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows users with TRIALING subscription', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.TRIALING,
    );
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a cancelled subscription left on the retired byok tier', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELLED,
    );
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue('byok');
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('throws 403 when subscription is inactive', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.CANCELLED,
    );
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).rejects.toThrow(
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

  it('throws 403 with PAST_DUE subscription', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      SubscriptionStatus.PAST_DUE,
    );
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('logs warning before throwing 403', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
      'none',
    );
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).rejects.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'SubscriptionGuard: No active subscription',
      expect.objectContaining({ userId: 'user_123' }),
    );
  });

  it('throws 403 when no subscription status set', async () => {
    vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue('');
    vi.mocked(authProviderUtil.getSubscriptionTier).mockReturnValue('');
    const ctx = buildContext(buildUser());
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new HttpException(expect.anything(), HttpStatus.FORBIDDEN),
    );
  });

  describe('credits in place of a plan', () => {
    beforeEach(() => {
      vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
        '',
      );
    });

    it('admits an unsubscribed organization that has credits left', async () => {
      getOrganizationCreditsBalance.mockResolvedValue(40);

      await expect(
        guard.canActivate(buildContext(buildUser())),
      ).resolves.toBe(true);
      expect(getOrganizationCreditsBalance).toHaveBeenCalledWith('org_123');
    });

    it('admits a credit-based module route on credits alone', async () => {
      getOrganizationCreditsBalance.mockResolvedValue(40);

      await expect(
        guard.canActivate(buildContext(buildUser(), undefined, 'playground')),
      ).resolves.toBe(true);
    });

    it('keeps the 403 with no subscription and no credits', async () => {
      getOrganizationCreditsBalance.mockResolvedValue(0);

      await expect(
        guard.canActivate(buildContext(buildUser())),
      ).rejects.toThrow(
        new HttpException(expect.anything(), HttpStatus.FORBIDDEN),
      );
    });

    it('still blocks a subscription-only module when only credits are left', async () => {
      getOrganizationCreditsBalance.mockResolvedValue(500);

      await expect(
        guard.canActivate(buildContext(buildUser(), undefined, 'automation')),
      ).rejects.toThrow(
        new HttpException(expect.anything(), HttpStatus.FORBIDDEN),
      );
      expect(getOrganizationCreditsBalance).not.toHaveBeenCalled();
    });

    it('fails closed when the wallet cannot be read', async () => {
      getOrganizationCreditsBalance.mockRejectedValue(new Error('db down'));

      await expect(
        guard.canActivate(buildContext(buildUser())),
      ).rejects.toThrow(HttpException);
    });

    it('does not consult credits on deployments without organization billing', async () => {
      billing.isEnabled = false;
      getOrganizationCreditsBalance.mockResolvedValue(500);

      await expect(
        guard.canActivate(buildContext(buildUser())),
      ).rejects.toThrow(HttpException);
      expect(getOrganizationCreditsBalance).not.toHaveBeenCalled();
    });

    it('lets a subscribed organization through without a wallet read', async () => {
      vi.mocked(authProviderUtil.getStripeSubscriptionStatus).mockReturnValue(
        SubscriptionStatus.ACTIVE,
      );

      await expect(
        guard.canActivate(buildContext(buildUser())),
      ).resolves.toBe(true);
      expect(getOrganizationCreditsBalance).not.toHaveBeenCalled();
    });
  });
});
