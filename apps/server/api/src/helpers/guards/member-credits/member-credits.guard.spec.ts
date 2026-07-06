vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_SELF_HOSTED: false,
  };
});

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { UNLIMITED_SEATS_FAIR_USE_CEILING } from '@api/collections/organization-settings/utils/seat-policy.util';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { SubscriptionTier } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
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
    [SubscriptionTier.PRO],
    [SubscriptionTier.SCALE],
    [SubscriptionTier.ENTERPRISE],
  ])('allows adding members past the stored seatsLimit on the unlimited-seat %s tier', async (subscriptionTier) => {
    organizationSettingsService.findOne.mockResolvedValue({
      id: '507f191e810c19729de860ee',
      seatsLimit: 1,
      subscriptionTier,
    });
    // Far past any finite seatsLimit, but still well under the fair-use ceiling.
    membersService.findAll.mockResolvedValue({
      docs: new Array(50).fill(1),
    });

    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('blocks with ForbiddenException once an unlimited-seat org hits the fair-use ceiling', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      id: '507f191e810c19729de860ee',
      seatsLimit: 1,
      subscriptionTier: SubscriptionTier.SCALE,
    });
    membersService.findAll.mockResolvedValue({
      docs: new Array(UNLIMITED_SEATS_FAIR_USE_CEILING).fill(1),
    });

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('never seat-gates self-hosted/community deployments (no billing context)', async () => {
    vi.resetModules();
    vi.doMock('@genfeedai/config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@genfeedai/config')>();
      return { ...actual, IS_SELF_HOSTED: true };
    });

    const { MemberCreditsGuard: SelfHostedMemberCreditsGuard } = await import(
      '@api/helpers/guards/member-credits/member-credits.guard'
    );

    const selfHostedOrganizationSettingsService = { findOne: vi.fn() };
    const selfHostedMembersService = { findAll: vi.fn() };

    const selfHostedGuard = new SelfHostedMemberCreditsGuard(
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
      selfHostedOrganizationSettingsService as OrganizationSettingsService,
      selfHostedMembersService as MembersService,
    );

    const result = await selfHostedGuard.canActivate(createContext());

    expect(result).toBe(true);
    // The self-hosted short-circuit must return before ever touching
    // OrganizationSetting/member lookups — there is no seat or billing
    // concept to enforce in self-hosted mode.
    expect(
      selfHostedOrganizationSettingsService.findOne,
    ).not.toHaveBeenCalled();
    expect(selfHostedMembersService.findAll).not.toHaveBeenCalled();

    vi.doUnmock('@genfeedai/config');
    vi.resetModules();
  });
});
