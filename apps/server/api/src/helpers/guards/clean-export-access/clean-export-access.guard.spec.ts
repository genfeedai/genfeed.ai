import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CleanExportAccessGuard } from '@api/helpers/guards/clean-export-access/clean-export-access.guard';
import * as authUtil from '@api/helpers/utils/auth/auth.util';
import { SubscriptionTier } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: vi.fn(),
  getSubscriptionTier: vi.fn(),
}));

function buildContext(
  user: User | null | undefined,
  body: Record<string, unknown> = { watermark: false },
): ExecutionContext {
  const request = { body, user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    brandId: 'brand_123',
    id: 'user_123',
    isSuperAdmin: false,
    organizationId: 'org_123',
    userId: 'user_123',
    ...overrides,
  };
}

describe('CleanExportAccessGuard', () => {
  let guard: CleanExportAccessGuard;
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CleanExportAccessGuard,
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    guard = module.get(CleanExportAccessGuard);

    vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(authUtil.getSubscriptionTier).mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('is defined', () => {
    expect(guard).toBeDefined();
  });

  describe('managed cloud (enforced)', () => {
    it('allows watermarked (branded) requests regardless of tier', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser(), { watermark: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it.each([
      {
        data: { type: 'ingredient-exports', attributes: { Watermark: false } },
      },
      {
        data: { type: 'ingredient-exports', attributes: { watermark: false } },
      },
      {
        watermark: true,
        data: { type: 'ingredient-exports', attributes: { watermark: false } },
      },
    ])('blocks free clean exports inside a JSON:API envelope (%j)', (body) => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      expect(() => guard.canActivate(buildContext(buildUser(), body))).toThrow(
        ForbiddenException,
      );
    });

    it('allows a free watermarked JSON:API export', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      expect(
        guard.canActivate(
          buildContext(buildUser(), {
            data: {
              type: 'ingredient-exports',
              attributes: { watermark: true },
            },
          }),
        ),
      ).toBe(true);
    });

    it('throws 401 for a clean-export request with no user in request', () => {
      const ctx = buildContext(null, { watermark: false });
      expect(() => guard.canActivate(ctx)).toThrow(
        new HttpException(
          { detail: 'Authentication required', title: 'Unauthorized' },
          HttpStatus.UNAUTHORIZED,
        ),
      );
    });

    it('blocks PAYG/free tier from a clean export with an upgrade message', () => {
      vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(
        SubscriptionTier.FREE,
      );
      const ctx = buildContext(buildUser());
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      try {
        guard.canActivate(ctx);
      } catch (error) {
        expect(error).toMatchObject({
          response: {
            code: 'PLAN_LIMIT_EXCEEDED',
            meta: {
              resource: 'clean-export',
              upgradeTier: SubscriptionTier.PRO,
            },
          },
        });
      }
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
    ])('allows a clean export on paid tier %s', (tier) => {
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
        'CleanExportAccessGuard: tier lacks clean-export access',
        expect.objectContaining({
          tier: SubscriptionTier.FREE,
          userId: 'user_123',
        }),
      );
    });
  });

  describe('self-hosted / community / desktop (bypassed)', () => {
    beforeEach(() => {
      vi.stubEnv('GENFEED_CLOUD', undefined);
    });

    it.each([SubscriptionTier.FREE, SubscriptionTier.BYOK])(
      'allows %s tier off cloud (no managed tiers/billing)',
      (tier) => {
        vi.mocked(authUtil.getSubscriptionTier).mockReturnValue(tier);
        const ctx = buildContext(buildUser());
        expect(guard.canActivate(ctx)).toBe(true);
      },
    );

    it('allows even with no user off cloud', () => {
      const ctx = buildContext(null);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
