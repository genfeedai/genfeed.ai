import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { SubscriptionTier } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const createContext = (): ExecutionContext => {
  const req: Record<string, unknown> = {
    params: { id: '507f191e810c19729de860ee'.toString() },
    user: {
      publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
    },
  };
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
};

describe('MemberCreditsGuard', () => {
  let guard: MemberCreditsGuard;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let membersService: { findAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    organizationSettingsService = { findOne: vi.fn() };
    membersService = { findAll: vi.fn() };

    guard = new MemberCreditsGuard(
      new Reflector(),
      {} as CreditsUtilsService,
      {} as ModelsService,
      {} as ByokService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as LoggerService,
      { get: vi.fn() } as ConfigService,
      organizationSettingsService as OrganizationSettingsService,
      membersService as MembersService,
    );
  });

  it('returns true when under seat limit', async () => {
    organizationSettingsService.findOne.mockResolvedValue({ seatsLimit: 2 });
    membersService.findAll.mockResolvedValue({ docs: [1] });

    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('checks credits when seat limit reached', async () => {
    const spy = vi
      .spyOn(CreditsGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

    organizationSettingsService.findOne.mockResolvedValue({
      id: '507f191e810c19729de860ee',
      seatsLimit: 1,
    });
    membersService.findAll.mockResolvedValue({ docs: [1] });

    const context = createContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().seatsLimit).toBeDefined();

    spy.mockRestore();
  });

  it.each([
    SubscriptionTier.SCALE,
    SubscriptionTier.ENTERPRISE,
  ])('allows adding members without the credit gate for the %s tier', async (tier) => {
    const spy = vi
      .spyOn(CreditsGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

    // Stored seatsLimit is well below the member count: an unlimited tier
    // must ignore it and never fall through to the credit path.
    organizationSettingsService.findOne.mockResolvedValue({
      id: '507f191e810c19729de860ee',
      seatsLimit: 3,
      subscriptionTier: tier,
    });
    membersService.findAll.mockResolvedValue({
      docs: new Array(50).fill(1),
    });

    const context = createContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().seatsLimit).toBeUndefined();

    spy.mockRestore();
  });

  it('throws once an unlimited tier hits the fair-use ceiling', async () => {
    const spy = vi
      .spyOn(CreditsGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

    organizationSettingsService.findOne.mockResolvedValue({
      id: '507f191e810c19729de860ee',
      seatsLimit: 3,
      subscriptionTier: SubscriptionTier.ENTERPRISE,
    });
    // At the fair-use ceiling — a defensive abuse backstop, not a billing gate.
    membersService.findAll.mockResolvedValue({
      docs: new Array(1000).fill(1),
    });

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
