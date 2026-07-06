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

import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import * as authUtil from '@api/helpers/utils/auth/auth.util';
import { SubscriptionTier } from '@genfeedai/enums';
import { FREE_BRAND_LIMIT } from '@genfeedai/pricing';
import { type ExecutionContext, HttpException } from '@nestjs/common';

vi.mock('@api/helpers/utils/auth/auth.util', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@api/helpers/utils/auth/auth.util')>();
  return {
    ...actual,
    getIsSuperAdmin: vi.fn(),
    getSubscriptionTier: vi.fn(),
  };
});

const orgId = '507f191e810c19729de860ee'.toString();

function createContext(): ExecutionContext {
  const req: Record<string, unknown> = {
    params: { id: orgId },
    user: {
      id: 'user_123',
      publicMetadata: { organization: orgId, subscriptionTier: '' },
    },
  };
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('BrandCreditsGuard', () => {
  let guard: BrandCreditsGuard;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockCloudMode = true;
    organizationSettingsService = { findOne: vi.fn() };
    brandsService = { findAll: vi.fn() };

    guard = new BrandCreditsGuard(
      organizationSettingsService as unknown as OrganizationSettingsService,
      brandsService as unknown as BrandsService,
    );

    vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(authUtil.getSubscriptionTier).mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the current free-tier brand count is under the pricing limit', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: SubscriptionTier.FREE,
    });
    brandsService.findAll.mockResolvedValue({ docs: [] });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('throws a structured plan-limit error when PAYG reaches its brand cap', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: SubscriptionTier.FREE,
    });
    brandsService.findAll.mockResolvedValue({
      docs: new Array(FREE_BRAND_LIMIT).fill({}),
    });

    await expect(guard.canActivate(createContext())).rejects.toMatchObject({
      response: {
        code: 'PLAN_LIMIT_EXCEEDED',
        meta: {
          currentCount: FREE_BRAND_LIMIT,
          limit: FREE_BRAND_LIMIT,
          resource: 'brands',
          upgradeTier: SubscriptionTier.PRO,
        },
      },
      status: 403,
    } satisfies Partial<HttpException>);
  });

  it.each([
    SubscriptionTier.PRO,
    SubscriptionTier.SCALE,
    SubscriptionTier.ENTERPRISE,
  ])('allows unlimited brand creation for paid tier %s', async (tier) => {
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: tier,
    });
    brandsService.findAll.mockResolvedValue({ docs: new Array(50).fill({}) });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(brandsService.findAll).not.toHaveBeenCalled();
  });

  it('uses PAYG/free limits when settings are missing', async () => {
    organizationSettingsService.findOne.mockResolvedValue(null);
    brandsService.findAll.mockResolvedValue({
      docs: new Array(FREE_BRAND_LIMIT).fill({}),
    });

    await expect(guard.canActivate(createContext())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PLAN_LIMIT_EXCEEDED',
      }),
    });
  });

  it('allows super admins regardless of tier', async () => {
    vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(true);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
  });

  it('bypasses brand plan limits outside managed cloud', async () => {
    mockCloudMode = false;

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
  });

  it('counts active brands with the current organization scope', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: SubscriptionTier.FREE,
    });
    brandsService.findAll.mockResolvedValue({ docs: [] });

    await guard.canActivate(createContext());

    expect(brandsService.findAll).toHaveBeenCalledWith(
      {
        where: {
          isDeleted: false,
          organization: orgId,
        },
      },
      { pagination: false },
      false,
    );
  });
});
