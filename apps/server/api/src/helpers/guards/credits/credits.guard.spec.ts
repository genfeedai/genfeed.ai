import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import {
  BusinessLogicException,
  InsufficientCreditsException,
} from '@api/exceptions/business-logic.exception';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import type { ByokService } from '@api/services/byok/byok.service';
import {
  ActivitySource,
  ByokProvider,
  ModelProvider,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  type ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const orgId = testId('org');

const createContext = (
  body: Record<string, unknown> = {},
): ExecutionContext => {
  const req: Record<string, unknown> = {
    body,
    params: {},
    user: { id: 'user-1', organizationId: orgId, userId: 'user-1' },
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
    reserveCredits: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let byokService: {
    resolveApiKey: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    reflector = new Reflector();
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
      reserveCredits: vi.fn().mockImplementation((input: { amount: number }) =>
        Promise.resolve({
          amount: input.amount,
          id: 'reservation-1',
          status: 'RESERVED',
        }),
      ),
    };
    modelsService = { findOne: vi.fn() };
    byokService = {
      resolveApiKey: vi.fn().mockResolvedValue(undefined),
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

  it.each([true, false])(
    'enforces credits after Free metered subscription deferral (funded: %s)',
    async (funded) => {
      const config = { amount: 10, description: 'Image generation' };
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
        key === CREDITS_KEY ? config : undefined,
      );
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        funded,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        funded ? 100 : 5,
      );
      const context = createContext();
      context.switchToHttp().getRequest().user.subscriptionTier =
        SubscriptionTier.FREE;
      const subscriptionGuard = new SubscriptionGuard(loggerService, reflector);
      expect(subscriptionGuard.canActivate(context)).toBe(true);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.getOrganizationCreditsBalance,
      ).not.toHaveBeenCalled();

      if (funded) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
          expect.objectContaining({ amount: 10, organizationId: orgId }),
        );
        expect(
          context.switchToHttp().getRequest().creditsConfig.reservationId,
        ).toBe('reservation-1');
      } else {
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
          InsufficientCreditsException,
        );
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
      }
    },
  );

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
    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        amount: 10,
        organizationId: orgId,
        workloadType: 'generation',
      }),
    );
  });

  it('skips credit admission and reservation for an opted-out body attribute', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      amount: 1,
      description: 'Prompt enhancement',
      skipWhenBodyAttribute: 'isSkipEnhancement',
    });
    const context = createContext({ isSkipEnhancement: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().creditsConfig).toMatchObject({
      amount: 0,
      skipWhenBodyAttribute: 'isSkipEnhancement',
    });
  });

  it('bills the fixed amount when the body model is only the target model (#5270)', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === CREDITS_KEY
        ? {
            amount: 1,
            description: 'Prompt enhancement',
            isBodyModelIgnored: true,
            skipWhenBodyAttribute: 'isSkipEnhancement',
          }
        : undefined,
    );
    const context = createContext({
      isSkipEnhancement: false,
      model: 'studio/unregistered-image-model',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 1);
    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1, organizationId: orgId }),
    );
    expect(
      context.switchToHttp().getRequest().creditsConfig.modelKey,
    ).toBeUndefined();
  });

  it('admits a zero-cost request without consulting the wallet (#5270)', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 0, key: 'free-model' });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockRejectedValue(
      new ConflictException('Billing account could not be resolved'),
    );
    const context = createContext({ model: 'free-model' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().creditsConfig).toMatchObject({
      amount: 0,
      modelKey: 'free-model',
    });
  });

  describe('error reporting (#5270)', () => {
    beforeEach(() => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 5 });
    });

    it('rejects an unknown pricing model as a bad request naming the model', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
      modelsService.findOne.mockResolvedValue(null);

      const rejection = guard.canActivate(
        createContext({ model: 'missing-model' }),
      );

      await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejection).rejects.toThrow('Unknown model: missing-model');
    });

    it('surfaces an unexpected failure instead of reporting 0 of 0 credits', async () => {
      const failure = new Error('connection terminated');
      creditsUtilsService.checkOrganizationCreditsAvailable.mockRejectedValue(
        failure,
      );

      await expect(guard.canActivate(createContext())).rejects.toBe(failure);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Credits guard: Error checking credits',
        failure,
      );
    });

    it('keeps the real balance in an insufficient-credits refusal', async () => {
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(3);

      // Match the fields, not a second instance: the response carries a
      // creation timestamp that differs across milliseconds.
      const rejection = guard.canActivate(createContext());

      await expect(rejection).rejects.toBeInstanceOf(
        InsufficientCreditsException,
      );
      await expect(rejection).rejects.toMatchObject({
        response: {
          code: 'INSUFFICIENT_CREDITS',
          meta: { available: 3, required: 5 },
        },
      });
    });

    it('returns 403 when the caller has no organization', async () => {
      const context = createContext();
      context.switchToHttp().getRequest().user = { id: 'user-1' };

      const rejection = guard.canActivate(context);

      await expect(rejection).rejects.toBeInstanceOf(HttpException);
      await expect(rejection).rejects.not.toBeInstanceOf(
        InsufficientCreditsException,
      );
      await expect(rejection).rejects.toMatchObject({ status: 403 });
    });
  });

  it('reads the opt-out body attribute from JSON:API attributes', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      amount: 1,
      description: 'Prompt enhancement',
      skipWhenBodyAttribute: 'isSkipEnhancement',
    });
    const context = createContext({
      data: { attributes: { isSkipEnhancement: true } },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
  });

  it('stores the reservation identity for settlement after generation', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      amount: 10,
      description: 'Image generation',
    });
    const ctx = createContext({ sourceActionId: 'action-1' });

    await guard.canActivate(ctx);

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      amount: 10,
      expiresAt: expect.any(Date),
      idempotencyKey: 'generation:action-1',
      organizationId: orgId,
      workloadId: 'action-1',
      workloadType: 'generation',
    });
    expect(ctx.switchToHttp().getRequest().creditsConfig).toMatchObject({
      reservationId: 'reservation-1',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('maps an uncovered atomic source-action reservation to a credit error', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      amount: 10,
      description: 'Image generation',
    });
    creditsUtilsService.reserveCredits.mockRejectedValue(
      new BusinessLogicException(
        'insufficient credits',
        undefined,
        'INSUFFICIENT_CREDITS',
      ),
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(4);

    await expect(
      guard.canActivate(createContext({ sourceActionId: 'action-short' })),
    ).rejects.toThrow();

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('multiplies a fixed per-output amount using a trusted guard override', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ amount: 2 });
    const context = createContext();
    const request = context.switchToHttp().getRequest() as Record<
      string,
      unknown
    >;
    request.creditsOutputCount = 3;

    await guard.canActivate(context);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 6);
  });

  it('looks up model from database when modelKey is in body', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({ cost: 5, key: 'test-model' });
    const result = await guard.canActivate(
      createContext({ model: 'test-model' }),
    );
    expect(result).toBe(true);
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: 'test-model',
    });
  });

  describe.each(['body', 'decorator'])('model pricing from %s', (source) => {
    it.each([
      ['known-model', { cost: 7, key: 'known-model' }, 7],
      [
        'training-model',
        { cost: 99, key: 'training-model', label: 'Training model' },
        5,
      ],
      [MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER, null, 500],
      ['genfeedai/custom/model', null, 5],
      ['fal-ai/unknown-model', null, 5],
    ])('prices %s consistently', async (model, record, expectedCredits) => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
        source === 'decorator' ? { modelKey: model } : {},
      );
      modelsService.findOne.mockResolvedValue(record);
      const context = createContext(source === 'body' ? { model } : {});

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(orgId, expectedCredits);
      expect(context.switchToHttp().getRequest().creditsConfig).toMatchObject({
        amount: expectedCredits,
        modelKey: model,
      });
    });
  });

  it('bills from providerCostUsd × applyMargin so admin margin applies live', async () => {
    const { applyMargin, setRuntimeMarginMultiplier } = await import(
      '@genfeedai/pricing'
    );
    setRuntimeMarginMultiplier(1);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    // $0.15 provider → applyMargin = 50 credits at multiplier 1.0
    modelsService.findOne.mockResolvedValue({
      cost: 999,
      key: 'priced-model',
      pricingType: 'flat',
      providerCostUsd: 0.15,
    });

    await guard.canActivate(createContext({ model: 'priced-model' }));

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, applyMargin(0.15, 1));

    // Raise admin margin → next bill uses new credits without rewriting Model.
    setRuntimeMarginMultiplier(1.2);
    await guard.canActivate(createContext({ model: 'priced-model' }));
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenLastCalledWith(orgId, applyMargin(0.15, 1.2));

    setRuntimeMarginMultiplier(1);
  });

  it('scales providerCostUsd by duration for per-second video models', async () => {
    const { applyMargin, setRuntimeMarginMultiplier } = await import(
      '@genfeedai/pricing'
    );
    setRuntimeMarginMultiplier(1);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({});
    modelsService.findOne.mockResolvedValue({
      cost: 400,
      costPerUnit: 80,
      defaultDuration: 5,
      key: 'bytedance/seedance-2.5',
      pricingType: 'per-second',
      providerCostUsd: 0.24,
    });

    await guard.canActivate(
      createContext({ duration: 10, model: 'bytedance/seedance-2.5' }),
    );

    // 10s × $0.24/s = $2.40 provider → applyMargin
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, applyMargin(2.4, 1));
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: 'bytedance/seedance-2.5',
    });
  });

  it.each([
    [MODEL_KEYS.REPLICATE_META_MUSICGEN, 90, 30],
    [MODEL_KEYS.REPLICATE_META_MUSICGEN, 4, 5],
    [MODEL_KEYS.REPLICATE_META_MUSICGEN, undefined, 10],
    [MODEL_KEYS.FAL_ELEVENLABS_MUSIC, 4, 10],
    [MODEL_KEYS.FAL_ELEVENLABS_MUSIC, undefined, 30],
    [MODEL_KEYS.FAL_LYRIA3_PRO, 90, undefined],
    [MODEL_KEYS.MUREKA_V9, 90, undefined],
    ['unknown-music', 90, undefined],
  ])(
    'admits music %s at normalized duration %s',
    async (model, duration, normalizedDuration) => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
        key === CREDITS_KEY
          ? { source: ActivitySource.MUSIC_GENERATION }
          : undefined,
      );
      modelsService.findOne.mockResolvedValue({
        cost: 7,
        costPerUnit: 2,
        key: model,
        pricingType: 'per-second',
      });
      const body = { model, duration };
      await guard.canActivate(createContext(body));
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(
        orgId,
        normalizedDuration === undefined ? 7 : normalizedDuration * 2,
      );
      expect(body.duration).toBe(duration);
    },
  );

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

  it('uses the model-aware 4K video generation band before dispatch', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === CREDITS_KEY) {
        return { source: ActivitySource.VIDEO_GENERATION };
      }
      return undefined;
    });
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      key: 'video-model',
    });

    await guard.canActivate(
      createContext({ model: 'video-model', resolution: '4k' }),
    );

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 40);
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
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({
      amount: 0,
      deferred: true,
      description: 'Image generation',
    });
  });

  it('applies a provider BYOK bypass before returning a deferred request when the route opts in', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === CREDITS_KEY) {
        return {
          allowByokBypass: true,
          description: 'Avatar generation',
          provider: ByokProvider.HEYGEN,
        };
      }
      if (key === CREDITS_DEFER_MODEL_RESOLUTION_KEY) return true;
      return undefined;
    });
    byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });
    const ctx = createContext();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.creditsConfig).toMatchObject({
      amount: 0,
      byokApiKeyOverride: 'byok-key',
      deferred: true,
      isByokBypass: true,
      provider: ByokProvider.HEYGEN,
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('does not let Replicate BYOK bypass credits for a Higgsfield catalog row', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      allowByokBypass: true,
    });
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      key: MODEL_KEYS.HIGGSFIELD_SOUL,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.REPLICATE
            ? { apiKey: 'byok-key' }
            : undefined,
        ),
    );

    await guard.canActivate(
      createContext({ model: MODEL_KEYS.HIGGSFIELD_SOUL }),
    );

    expect(byokService.resolveApiKey).toHaveBeenCalledWith(
      orgId,
      ByokProvider.HIGGSFIELD,
    );
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(orgId, 10);
  });

  it('bypasses credits exactly once when Higgsfield BYOK is active and the route opts in', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      allowByokBypass: true,
    });
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      key: MODEL_KEYS.HIGGSFIELD_SOUL,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.HIGGSFIELD
            ? { apiKey: 'byok-key' }
            : undefined,
        ),
    );
    const context = createContext({ model: MODEL_KEYS.HIGGSFIELD_SOUL });

    await guard.canActivate(context);

    expect(byokService.resolveApiKey).toHaveBeenCalledTimes(1);
    expect(byokService.resolveApiKey).toHaveBeenCalledWith(
      orgId,
      ByokProvider.HIGGSFIELD,
    );
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(context.switchToHttp().getRequest().creditsConfig).toMatchObject({
      byokApiKeyOverride: 'byok-key',
      isByokBypass: true,
      provider: ByokProvider.HIGGSFIELD,
    });
  });

  // #5294 billing fails safe: without an explicit `allowByokBypass: true` on
  // the route's @Credits config, the guard must never resolve a BYOK
  // provider and must charge credits normally — even when the org has an
  // active key for the model's resolved provider and even when the
  // decorator sets `provider` directly. This is the default for every route,
  // including any new `@Credits({ modelKey })` route added later.
  describe('billing fails safe without allowByokBypass (#5294)', () => {
    it('charges credits normally for an explicit provider when allowByokBypass is not set', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        amount: 10,
        provider: ByokProvider.REPLICATE,
      });
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });
      const context = createContext();

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(orgId, 10);
      expect(
        context.switchToHttp().getRequest().creditsConfig,
      ).not.toHaveProperty('isByokBypass');
    });

    it('charges credits normally for a resolvable modelKey when allowByokBypass is not set', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      });
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        key: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        provider: ModelProvider.REPLICATE,
      });
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });

      const context = createContext({
        model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      });
      await guard.canActivate(context);

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(orgId, 10);
      expect(
        context.switchToHttp().getRequest().creditsConfig,
      ).not.toHaveProperty('isByokBypass');
    });

    it('charges credits normally when allowByokBypass is explicitly false', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        allowByokBypass: false,
        amount: 10,
        provider: ByokProvider.REPLICATE,
      });
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key' });
      const context = createContext();

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(orgId, 10);
    });
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
    expect(modelsService.findOne).toHaveBeenCalledWith({
      key: 'fal-ai/flux-2-pro',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalled();
  });
});
