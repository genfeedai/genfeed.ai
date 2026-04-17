import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { ConfigService } from '@api/config/config.service';
import { BrandCreditsGuard } from '@api/helpers/guards/brand-credits/brand-credits.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import type { ByokService } from '@api/services/byok/byok.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const orgId = '507f191e810c19729de860ee'.toString();

const createContext = (): ExecutionContext => {
  const req: Record<string, unknown> = {
    params: { id: '507f191e810c19729de860ee'.toString() },
    user: { publicMetadata: { organization: orgId } },
  };
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
};

const loggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

describe('BrandCreditsGuard', () => {
  let guard: BrandCreditsGuard;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    organizationSettingsService = { findOne: vi.fn() };
    brandsService = { findAll: vi.fn() };

    guard = new BrandCreditsGuard(
      new Reflector(),
      {} as CreditsUtilsService,
      {} as ModelsService,
      {} as ByokService,
      loggerService,
      { get: vi.fn() } as unknown as ConfigService,
      organizationSettingsService as unknown as OrganizationSettingsService,
      brandsService as unknown as BrandsService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('returns true when no settings found', async () => {
    organizationSettingsService.findOne.mockResolvedValue(null);
    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('returns true when brand count is under the limit', async () => {
    organizationSettingsService.findOne.mockResolvedValue({ brandsLimit: 5 });
    brandsService.findAll.mockResolvedValue({ docs: [1, 2] });
    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('delegates to CreditsGuard when brand limit is reached', async () => {
    const spy = vi
      .spyOn(CreditsGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

    organizationSettingsService.findOne.mockResolvedValue({
      _id: '507f191e810c19729de860ee',
      brandsLimit: 2,
    });
    brandsService.findAll.mockResolvedValue({ docs: [1, 2] });

    const ctx = createContext();
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sets brandsLimit on the request when at limit', async () => {
    vi.spyOn(CreditsGuard.prototype, 'canActivate').mockResolvedValue(true);

    const settingsId = '507f191e810c19729de860ee';
    organizationSettingsService.findOne.mockResolvedValue({
      _id: settingsId,
      brandsLimit: 1,
    });
    brandsService.findAll.mockResolvedValue({ docs: [1] });

    const ctx = createContext();
    await guard.canActivate(ctx);

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.brandsLimit).toEqual({
      current: 1,
      id: settingsId.toString(),
    });
  });

  it('calls organizationSettingsService.findOne with correct org id', async () => {
    organizationSettingsService.findOne.mockResolvedValue(null);
    await guard.canActivate(createContext());
    expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
      organization: expect.any(Types.ObjectId),
    });
  });

  it('calls brandsService.findAll with correct aggregate query', async () => {
    organizationSettingsService.findOne.mockResolvedValue({ brandsLimit: 5 });
    brandsService.findAll.mockResolvedValue({ docs: [] });
    await guard.canActivate(createContext());
    expect(brandsService.findAll).toHaveBeenCalledWith(
      [
        {
          $match: {
            isDeleted: false,
            organization: expect.any(Types.ObjectId),
          },
        },
      ],
      { pagination: false },
    );
  });

  it('does not call brandsService when settings is null', async () => {
    organizationSettingsService.findOne.mockResolvedValue(null);
    await guard.canActivate(createContext());
    expect(brandsService.findAll).not.toHaveBeenCalled();
  });

  it('extends CreditsGuard', () => {
    expect(guard).toBeInstanceOf(CreditsGuard);
  });
});
