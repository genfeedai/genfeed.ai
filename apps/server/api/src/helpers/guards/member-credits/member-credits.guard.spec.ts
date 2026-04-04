import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigService } from '@api/config/config.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';

const createContext = (): ExecutionContext => {
  const req: Record<string, unknown> = {
    params: { id: new Types.ObjectId().toString() },
    user: { publicMetadata: { organization: new Types.ObjectId().toString() } },
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
      _id: new Types.ObjectId(),
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
});
