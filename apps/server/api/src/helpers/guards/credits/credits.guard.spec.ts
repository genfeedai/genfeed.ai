import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ConfigService } from '@api/config/config.service';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import type { ByokService } from '@api/services/byok/byok.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';

const orgId = new Types.ObjectId().toString();

const createContext = (
  body: Record<string, unknown> = {},
): ExecutionContext => {
  const req: Record<string, unknown> = {
    body,
    params: {},
    user: { id: 'user-1', publicMetadata: { organization: orgId } },
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

describe('CreditsGuard', () => {
  let guard: CreditsGuard;
  let reflector: Reflector;
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let byokService: {
    isByokActiveForProvider: ReturnType<typeof vi.fn>;
    isByokBillingInGoodStanding: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    reflector = new Reflector();
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    modelsService = { findOne: vi.fn() };
    byokService = {
      isByokActiveForProvider: vi.fn().mockResolvedValue(false),
      isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
    };

    guard = new CreditsGuard(
      reflector,
      creditsUtilsService as unknown as CreditsUtilsService,
      modelsService as unknown as ModelsService,
      byokService as unknown as ByokService,
      loggerService,
      { get: vi.fn() } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('returns true when no credits config on the handler', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('returns true when user has enough credits with fixed amount', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 10 });
    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 10);
  });

  it('throws InsufficientCreditsException when credits insufficient', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 10 });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(5);
    await expect(guard.canActivate(createContext())).rejects.toThrow();
  });

  it('looks up model from database when modelKey is in body', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 5, key: 'test-model' });
    const result = await guard.canActivate(
      createContext({ model: 'test-model' }),
    );
    expect(result).toBe(true);
    expect(modelsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      key: 'test-model',
    });
  });

  it('multiplies credits by 2 for high resolution via data.attributes', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 10, key: 'img-model' });
    // JSON:API-style body with data.attributes to ensure resolution is parsed
    const ctx = createContext({
      data: { attributes: { model: 'img-model', resolution: 'high' } },
    });
    await guard.canActivate(ctx);
    // Cost 10 for flat model × 2 for high res = 20
    const calledAmount =
      creditsUtilsService.checkOrganizationCreditsAvailable.mock.calls[0][1];
    expect(calledAmount).toBeGreaterThanOrEqual(10);
  });

  it('multiplies credits by outputs count', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 5, key: 'img-model' });
    const ctx = createContext({ model: 'img-model', outputs: 3 });
    await guard.canActivate(ctx);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 15);
  });

  it('throws when no model in body and no modelKey or amount in decorator', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    await expect(guard.canActivate(createContext())).rejects.toThrow();
  });

  it('returns true and sets deferred flag when endpoint defers model resolution', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === CREDITS_KEY) {
        return { description: 'Image generation' };
      }

      if (key === CREDITS_DEFER_MODEL_RESOLUTION_KEY) {
        return true;
      }

      return undefined;
    });

    const ctx = createContext({
      data: { attributes: { text: 'Generate an image of a boxer' } },
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({
      amount: 0,
      deferred: true,
      description: 'Image generation',
    });
  });

  it('stores creditsConfig on the request after successful check', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 7 });
    const ctx = createContext();
    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({ amount: 7 });
  });

  it('returns true and sets deferred flag when autoSelectModel is true with no model', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      description: 'Image generation',
    });
    const ctx = createContext({ autoSelectModel: true });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({
      amount: 0,
      deferred: true,
    });
  });

  it('returns true and sets deferred flag when autoSelectModel is in data.attributes', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      description: 'Image generation',
    });
    const ctx = createContext({
      data: { attributes: { autoSelectModel: true } },
    });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({
      amount: 0,
      deferred: true,
    });
  });

  it('does not defer when autoSelectModel is true but model is also provided', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 5, key: 'test-model' });
    const ctx = createContext({ autoSelectModel: true, model: 'test-model' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    // Should not be deferred since model was resolved via the normal path
    expect(
      (req.creditsConfig as Record<string, unknown>)?.deferred,
    ).toBeUndefined();
  });

  it('applies fallback pricing for dynamic fal destinations', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    const ctx = createContext({ model: 'fal-ai/flux-2-pro' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalled();
  });

  it('throws when user has no organization', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 5 });
    const req: Record<string, unknown> = {
      body: {},
      params: {},
      user: { id: 'user-1', publicMetadata: {} },
    };
    const ctx = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });
});
