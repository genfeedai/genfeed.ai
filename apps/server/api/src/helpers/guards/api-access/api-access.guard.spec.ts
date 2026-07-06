import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiAccessGuard } from '@api/helpers/guards/api-access/api-access.guard';
import * as authUtil from '@api/helpers/utils/auth/auth.util';
import { SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

// IS_CLOUD_MODE is a module-load const; expose it as a togglable getter so we
// can exercise both cloud (enforced) and non-cloud (bypassed) paths.
let mockCloudMode = true;
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    get IS_CLOUD_MODE() {
      return mockCloudMode;
    },
  };
});

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: vi.fn(),
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

describe('ApiAccessGuard', () => {
  let guard: ApiAccessGuard;
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockCloudMode = true;
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ApiAccessGuard,
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    guard = module.get(ApiAccessGuard);

    vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(authUtil.getSubscriptionTier).mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is defined', () => {
    expect(guard).toBeDefined();
  });

  describe('managed cloud (enforced)', () => {
    it('throws 401 when no user in request', () => {
      const ctx = buildContext(null);
      expect(() => guard.canActivate(ctx)).toThrow(
        new HttpException(
          { detail: 'Authentication required', title: 'Unauthorized' },
          HttpStatus.UNAUTHORIZED,
        ),
      );
    });

    it('blocks PAYG/free tier with a ForbiddenException upgrade message', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser());
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow(/upgrade/i);
    });

    it('blocks BYOK (free) tier', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.BYOK,
      );
      const ctx = buildContext(buildUser());
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('blocks an unknown/empty tier (default-deny)', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue('');
      const ctx = buildContext(buildUser());
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it.each([
      SubscriptionTier.PRO,
      SubscriptionTier.SCALE,
      SubscriptionTier.ENTERPRISE,
    ])('allows paid tier %s', (tier) => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(tier);
      const ctx = buildContext(buildUser());
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows super admins regardless of tier', () => {
      vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(true);
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser());
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bypasses API-key-authenticated requests (consistent with SubscriptionGuard)', () => {
      const ctx = buildContext(buildUser({ isApiKey: true }));
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('logs a warning before throwing 403', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser());
      expect(() => guard.canActivate(ctx)).toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ApiAccessGuard: tier lacks API access',
        expect.objectContaining({
          tier: SubscriptionTier.FREE,
          userId: 'user_123',
        }),
      );
    });
  });

  describe('self-hosted / community / desktop (bypassed)', () => {
    beforeEach(() => {
      mockCloudMode = false;
    });

    it('allows free tier off cloud (no tiers/billing)', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser());
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows even with no user off cloud', () => {
      const ctx = buildContext(null);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
