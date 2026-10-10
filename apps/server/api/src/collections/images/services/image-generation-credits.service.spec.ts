import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { generationQuoteIdentityHash } from '@api/helpers/utils/credits/approved-generation-quote.util';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import {
  ByokProvider,
  ModelCategory,
  ModelProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { DEFAULT_GENERATION_MARGIN_MULTIPLIER } from '@genfeedai/pricing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ImageGenerationCreditsService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };
  const providerRegistry = {
    supports: vi.fn().mockReturnValue(true),
    providerFor: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };

  let service: ImageGenerationCreditsService;

  it.each([
    'same',
    'outputs',
    'dimensions',
    'tariff',
    'byok',
    'ceiling',
  ] as const)(
    'binds actual MCP preparation before reservation: %s',
    async (change) => {
      const model = 'test/fal-mcp-quote';
      modelsService.findOne.mockResolvedValue({
        key: model,
        provider: 'fal',
        cost: 10,
      });
      const dto = { outputs: 1, width: 1024, height: 1024 };
      const snapshot = await testModelCreditQuote(
        modelsService as never,
        'fal',
      ).quoteSnapshotByKey(model, {
        organizationId: 'org-1',
        provider: 'fal',
        outputs: 1,
        requests: 1,
        width: 1024,
        height: 1024,
      });
      const request = {
        body: { sourceActionId: 'mcp-quote-test' },
        user: { userId: 'user-1' },
        creditsConfig: {
          deferred: true,
          approvedGenerationQuote: {
            model,
            provider: snapshot.provider,
            unitCredits: snapshot.credits,
            maximumCredits: change === 'ceiling' ? 0 : snapshot.credits,
            billingMode: 'credits' as const,
            pricingHash: generationQuoteIdentityHash(snapshot),
            quantities: snapshot.quantities,
          },
        },
      };
      if (change === 'outputs') dto.outputs = 2;
      if (change === 'dimensions') dto.width = 2048;
      if (change === 'tariff')
        modelsService.findOne.mockResolvedValue({ cost: 11 });
      if (change === 'byok')
        byokService.resolveApiKey.mockResolvedValue({ apiKey: 'test-key' });
      const admission = service.ensureDeferredCredits(
        dto as never,
        model,
        'org-1',
        request as never,
      );
      if (change === 'same') {
        await expect(admission).resolves.toBeUndefined();
        expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
          expect.objectContaining({ amount: snapshot.credits }),
        );
      } else {
        await expect(admission).rejects.toThrow('fresh quote');
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(
          creditsUtilsService.checkOrganizationCreditsAvailable,
        ).not.toHaveBeenCalled();
        expect(request.creditsConfig.deferred).toBe(true);
      }
    },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    providerRegistry.providerFor.mockReturnValue('fal');
    byokService.resolveApiKey.mockResolvedValue(undefined);
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    creditsUtilsService.reserveCredits.mockImplementation(
      (input: IReserveCreditsInput) =>
        Promise.resolve({
          amount: input.amount,
          metadata: input.metadata,
          id: 'reservation-1',
          status: 'RESERVED',
        }),
    );
    service = new ImageGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      providerRegistry as never,
      byokService as never,
      testModelCreditQuote(modelsService as never, 'fal'),
      { buildPrompt: vi.fn() } as never,
    );
  });

  describe('approved remix quote', () => {
    const dto = { outputs: 1, height: 1024, width: 1024 };
    const model = 'fal/model';
    const registered = {
      key: model,
      category: ModelCategory.IMAGE,
      isActive: true,
      isDeleted: false,
      provider: ModelProvider.FAL,
      cost: 10,
    };

    it('quotes the same unit charge without reservation or balance mutation', async () => {
      modelsService.findOne.mockResolvedValue(registered);
      const quote = await service.quoteCredits(dto as never, model, 'org-1');
      expect(quote).toMatchObject({ unitCredits: 10, billingMode: 'credits' });
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      const request = {
        creditsConfig: {
          deferred: true,
          approvedImageQuote: { model, ...quote },
        },
      };
      await service.ensureDeferredCredits(
        dto as never,
        model,
        'org-1',
        request as never,
      );
      expect(request.creditsConfig).toMatchObject({
        amount: quote.unitCredits,
        deferred: false,
      });
    });

    it.each(['price', 'byok', 'model'] as const)(
      'rejects %s changed after early validation before reserving or committing',
      async (change) => {
        modelsService.findOne.mockResolvedValue(registered);
        const quote = await service.quoteCredits(dto as never, model, 'org-1');
        const request = {
          body: { sourceActionId: 'remix-variant' },
          creditsConfig: {
            deferred: true,
            approvedImageQuote: { model, ...quote },
          },
        };
        await service.assertApprovedQuote(
          dto as never,
          model,
          'org-1',
          request as never,
        );
        if (change === 'price')
          modelsService.findOne.mockResolvedValue({ ...registered, cost: 20 });
        if (change === 'byok')
          byokService.resolveApiKey.mockResolvedValue({ apiKey: 'fal-key' });
        await expect(
          service.ensureDeferredCredits(
            dto as never,
            change === 'model' ? 'fal/other' : model,
            'org-1',
            request as never,
          ),
        ).rejects.toThrow('changed');
        expect(request.creditsConfig.deferred).toBe(true);
        expect(request.creditsConfig).not.toHaveProperty('amount');
      },
    );

    it('keeps the calculated base unit and reports BYOK without reserving platform credits', async () => {
      modelsService.findOne.mockResolvedValue(registered);
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'fal-key' });
      const quote = await service.quoteCredits(dto as never, model, 'org-1');
      expect(quote).toMatchObject({
        unitCredits: 10,
        billingMode: 'byok',
        provider: ByokProvider.FAL,
      });
      const request = {
        creditsConfig: {
          deferred: true,
          approvedImageQuote: { model, ...quote },
        },
      };
      await service.ensureDeferredCredits(
        dto as never,
        model,
        'org-1',
        request as never,
      );
      expect(request.creditsConfig).toMatchObject({
        amount: 10,
        byokApiKeyOverride: 'fal-key',
        isByokBypass: true,
      });
    });
  });

  it('returns immediately when credits are not deferred', async () => {
    const request = { creditsConfig: { deferred: false } };

    await service.ensureDeferredCredits(
      { outputs: 2, height: 1080, width: 1920 } as never,
      'fal/model',
      'org-1',
      request as never,
    );

    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(request.creditsConfig).toEqual({ deferred: false });
  });

  it('throws 402 when the organization cannot cover the fan-out amount', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(4);
    const request = { creditsConfig: { deferred: true } };

    const error = await service
      .ensureDeferredCredits(
        { outputs: 2, height: 1080, width: 1920 } as never,
        'fal/model',
        'org-1',
        request as never,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toEqual({
      detail: 'Insufficient credits: 20 required, 4 available',
      title: 'Insufficient credits',
    });
  });

  it('settles deferred credits after a successful authorization', async () => {
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { outputs: 2, height: 1080, width: 1920 } as never,
      'fal/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      amount: 20,
      deferred: false,
      modelKey: 'fal/model',
      pricingMetadata: {
        marginMultiplier: DEFAULT_GENERATION_MARGIN_MULTIPLIER,
        pricingType: null,
        providerCostUsd: null,
      },
    });
  });

  it('reserves resolved generation credits before provider dispatch', async () => {
    const request = {
      body: { sourceActionId: 'image-action-1' },
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    await service.ensureDeferredCredits(
      { outputs: 2, height: 1080, width: 1920 } as never,
      'fal/model',
      'org-1',
      request as never,
    );

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        amount: 20,
        expiresAt: expect.any(Date),
        idempotencyKey: 'generation:image-action-1',
        organizationId: 'org-1',
        workloadId: 'image-action-1',
        workloadType: 'generation',
      }),
    );
    expect(request.creditsConfig).toMatchObject({
      reservationId: 'reservation-1',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('returns 402 when the atomic source-action reservation cannot be covered', async () => {
    creditsUtilsService.reserveCredits.mockRejectedValue(
      new BusinessLogicException(
        'insufficient credits',
        undefined,
        'INSUFFICIENT_CREDITS',
      ),
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(4);
    const request = {
      body: { sourceActionId: 'image-action-insufficient' },
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    const error = await service
      .ensureDeferredCredits(
        { outputs: 2, height: 1080, width: 1920 } as never,
        'fal/model',
        'org-1',
        request as never,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('records resolved-provider BYOK usage without requiring platform credits', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.FAL,
    });
    byokService.resolveApiKey.mockResolvedValue({ apiKey: 'fal-key' });
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { outputs: 2, height: 1080, width: 1920 } as never,
      'fal/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      amount: 20,
      byokApiKeyOverride: 'fal-key',
      deferred: false,
      isByokBypass: true,
      modelKey: 'fal/model',
      provider: 'fal',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('charges credits when only Replicate BYOK is active for Higgsfield Soul', async () => {
    providerRegistry.providerFor.mockReturnValue('higgsfield');
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: 'higgsfield',
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.REPLICATE
            ? { apiKey: 'replicate-key' }
            : undefined,
        ),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { height: 1080, width: 1920 } as never,
      MODEL_KEYS.HIGGSFIELD_SOUL,
      'org-1',
      request as never,
    );

    expect(byokService.resolveApiKey).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.HIGGSFIELD,
    );
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org-1', 10);
    expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
    expect(request.creditsConfig).not.toHaveProperty('byokApiKeyOverride');
  });

  it('uses Higgsfield BYOK for Soul without charging platform credits', async () => {
    providerRegistry.providerFor.mockReturnValue('higgsfield');
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: 'higgsfield',
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.HIGGSFIELD
            ? { apiKey: 'higgsfield-key' }
            : undefined,
        ),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { height: 1080, width: 1920 } as never,
      MODEL_KEYS.HIGGSFIELD_SOUL,
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      byokApiKeyOverride: 'higgsfield-key',
      isByokBypass: true,
      provider: ByokProvider.HIGGSFIELD,
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('stamps provider-cost pricing metadata for live-priced models', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 50,
      pricingType: 'flat',
      providerCostUsd: 0.15,
    });
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { height: 1080, width: 1920 } as never,
      'fal/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      pricingMetadata: {
        marginMultiplier: DEFAULT_GENERATION_MARGIN_MULTIPLIER,
        pricingType: 'flat',
        providerCostUsd: 0.15,
      },
    });
  });

  // #5294 — the credit decision and the provider dispatch key must be resolved
  // from the same `resolveApiKey` call. A key that resolves to nothing (never
  // saved, or saved for the wrong provider) must never bypass credits, and a
  // key that resolves must always be carried on `byokApiKeyOverride` so the
  // adapter that dispatches next actually spends it.
  describe('BYOK dispatch-key / credit-decision agreement (#5294)', () => {
    it('charges platform credits when GENFEED_AI hosted models run under an org Replicate key', async () => {
      // GENFEED_AI dispatches through Genfeed's own ComfyUI fleet, never the
      // org's Replicate account — resolveModelByokProvider must not map it.
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.GENFEED_AI,
      });
      byokService.resolveApiKey.mockResolvedValue({
        apiKey: 'org-replicate-key',
      });
      providerRegistry.providerFor.mockReturnValue('genfeedai');
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.GENFEED_AI,
      });
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        { outputs: 1, height: 1080, width: 1920 } as never,
        'genfeed-ai/some-model',
        'org-1',
        request as never,
      );

      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
      expect(request.creditsConfig).toMatchObject({ amount: 10 });
      expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
      expect(request.creditsConfig).not.toHaveProperty('byokApiKeyOverride');
    });

    it('charges credits normally when no key was ever saved for the resolved provider', async () => {
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.FAL,
      });
      byokService.resolveApiKey.mockResolvedValue(undefined);
      const request = {
        body: { sourceActionId: 'no-byok-key' },
        creditsConfig: { deferred: true },
        user: { userId: 'user-1' },
      };

      await service.ensureDeferredCredits(
        { outputs: 1, height: 1080, width: 1920 } as never,
        'fal/model',
        'org-1',
        request as never,
      );

      expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 10 }),
      );
      expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
      expect(request.creditsConfig).not.toHaveProperty('byokApiKeyOverride');
    });

    it('bypasses credits and carries the exact resolved key when a Fal key is saved and active', async () => {
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.FAL,
      });
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'fal-org-key' });
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        { outputs: 1, height: 1080, width: 1920 } as never,
        'fal/model',
        'org-1',
        request as never,
      );

      expect(request.creditsConfig).toMatchObject({
        amount: 10,
        byokApiKeyOverride: 'fal-org-key',
        isByokBypass: true,
        provider: ByokProvider.FAL,
      });
    });
  });
  it.each([2, 3, 4])(
    'rejects unfunded Higgsfield native batch requests before holding credits (%s)',
    async (outputs) => {
      providerRegistry.providerFor.mockReturnValue('higgsfield');
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: 'higgsfield',
      });
      await expect(
        service.ensureDeferredCredits(
          { outputs } as never,
          MODEL_KEYS.HIGGSFIELD_SOUL,
          'org-1',
          { creditsConfig: { deferred: true } } as never,
        ),
      ).rejects.toThrow('one funded output');
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
    },
  );
});
