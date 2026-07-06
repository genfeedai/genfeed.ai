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

import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { UNLIMITED_SEATS_FAIR_USE_CEILING } from '@api/collections/organization-settings/utils/seat-policy.util';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import * as authUtil from '@api/helpers/utils/auth/auth.util';
import { SubscriptionTier } from '@genfeedai/enums';
import { FREE_SEAT_LIMIT } from '@genfeedai/pricing';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';

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
  } as ExecutionContext;
}

describe('MemberCreditsGuard', () => {
  let guard: MemberCreditsGuard;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let membersService: { findAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockCloudMode = true;
    organizationSettingsService = { findOne: vi.fn() };
    membersService = { findAll: vi.fn() };

    guard = new MemberCreditsGuard(
      organizationSettingsService as unknown as OrganizationSettingsService,
      membersService as unknown as MembersService,
    );

    vi.mocked(authUtil.getIsSuperAdmin).mockReturnValue(false);
    vi.mocked(authUtil.getSubscriptionTier).mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when under the free solo seat limit', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      seatsLimit: FREE_SEAT_LIMIT,
      subscriptionTier: SubscriptionTier.FREE,
    });
    membersService.findAll.mockResolvedValue({ docs: [] });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('throws a structured plan-limit error when a free org already has its solo member', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      seatsLimit: FREE_SEAT_LIMIT,
      subscriptionTier: SubscriptionTier.FREE,
    });
    membersService.findAll.mockResolvedValue({
      docs: new Array(FREE_SEAT_LIMIT).fill({}),
    });

    await expect(guard.canActivate(createContext())).rejects.toMatchObject({
      response: {
        code: 'PLAN_LIMIT_EXCEEDED',
        meta: {
          currentCount: FREE_SEAT_LIMIT,
          limit: FREE_SEAT_LIMIT,
          resource: 'seats',
          upgradeTier: SubscriptionTier.PRO,
        },
      },
      status: 403,
    });
  });

  it.each([
    SubscriptionTier.PRO,
    SubscriptionTier.SCALE,
    SubscriptionTier.ENTERPRISE,
  ])('allows adding members past stored seatsLimit on unlimited-seat %s', async (subscriptionTier) => {
    organizationSettingsService.findOne.mockResolvedValue({
      seatsLimit: 1,
      subscriptionTier,
    });
    membersService.findAll.mockResolvedValue({
      docs: new Array(50).fill({}),
    });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('blocks with ForbiddenException once an unlimited-seat org hits the fair-use ceiling', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      seatsLimit: 1,
      subscriptionTier: SubscriptionTier.SCALE,
    });
    membersService.findAll.mockResolvedValue({
      docs: new Array(UNLIMITED_SEATS_FAIR_USE_CEILING).fill({}),
    });

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses PAYG/free limits when settings are missing', async () => {
    organizationSettingsService.findOne.mockResolvedValue(null);
    membersService.findAll.mockResolvedValue({
      docs: new Array(FREE_SEAT_LIMIT).fill({}),
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

  it('never seat-gates outside managed cloud', async () => {
    mockCloudMode = false;

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
    expect(membersService.findAll).not.toHaveBeenCalled();
  });

  it('counts non-deleted organization members before allowing an invite', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      seatsLimit: FREE_SEAT_LIMIT,
      subscriptionTier: SubscriptionTier.FREE,
    });
    membersService.findAll.mockResolvedValue({ docs: [] });

    await guard.canActivate(createContext());

    expect(membersService.findAll).toHaveBeenCalledWith(
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
