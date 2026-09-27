import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import {
  ActivitySource,
  ByokProvider,
  ModelProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { DEFAULT_GENERATION_MARGIN_MULTIPLIER } from '@genfeedai/pricing';
import { estimateClipChainCredits } from '@genfeedai/workflows/engine';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideoGenerationCreditsService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    settleReservation: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };

  let service: VideoGenerationCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    byokService.resolveApiKey.mockResolvedValue(undefined);
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    creditsUtilsService.reserveCredits.mockImplementation(
      (input: IReserveCreditsInput) =>
        Promise.resolve({
          amount: input.amount,
          id: 'reservation-1',
          status: 'RESERVED',
        }),
    );
    service = new VideoGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      byokService as never,
    );
  });

  it('skips authorization when the request is not deferred', async () => {
    await service.ensureDeferredCredits(
      { outputs: 2, resolution: 'high' } as never,
      'kling/model',
      'org-1',
      {} as never,
    );

    expect(modelsService.findOne).not.toHaveBeenCalled();
  });

  it('authorizes high-resolution non-batch fan-out and throws 402 when short', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(5);
    const request = { creditsConfig: { deferred: true } };

    const error = await service
      .ensureDeferredCredits(
        { outputs: 2, resolution: 'high' } as never,
        'kling/model',
        'org-1',
        request as never,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toEqual({
      detail: 'Insufficient credits: 40 required, 5 available',
      title: 'Insufficient credits',
    });
  });

  it('settles deferred credits with the pricing audit stamp', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      pricingType: 'per-second',
      providerCostUsd: 0.24,
    });
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      'kling/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toEqual({
      amount: 10,
      deferred: false,
      modelKey: 'kling/model',
      pricingMetadata: {
        marginMultiplier: DEFAULT_GENERATION_MARGIN_MULTIPLIER,
        pricingType: 'per-second',
        providerCostUsd: 0.24,
      },
    });
  });

  it('reserves resolved generation credits before provider dispatch', async () => {
    const request = {
      body: { sourceActionId: 'video-action-1' },
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      'kling/model',
      'org-1',
      request as never,
    );

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      amount: 10,
      expiresAt: expect.any(Date),
      idempotencyKey: 'generation:video-action-1',
      organizationId: 'org-1',
      workloadId: 'video-action-1',
      workloadType: 'generation',
    });
    expect(request.creditsConfig).toMatchObject({
      reservationId: 'reservation-1',
    });
  });

  it('adds only the stitch cost for a fabricated extension', async () => {
    const request = {
      creditsConfig: { amount: 10, modelKey: 'google/veo-3.1' },
    };

    await service.ensureExtensionCredits(
      { duration: 8 },
      'google/veo-3.1',
      'org-1',
      request as never,
      'fabricated',
    );

    expect(request.creditsConfig.amount).toBe(11);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org-1', 11);
  });

  it('reserves the final fabricated extension amount including stitch cost', async () => {
    const request = {
      body: { sourceActionId: 'extension-action-1' },
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    await service.ensureExtensionCredits(
      { duration: 8 },
      'google/veo-3.1',
      'org-1',
      request as never,
      'fabricated',
    );

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledOnce();
    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 11 }),
    );
  });

  it('does not add a stitch cost to native extension', async () => {
    const request = {
      creditsConfig: { amount: 10, modelKey: 'bytedance/seedance-2.5' },
    };

    await service.ensureExtensionCredits(
      { duration: 8 },
      'bytedance/seedance-2.5',
      'org-1',
      request as never,
      'native',
    );

    expect(request.creditsConfig.amount).toBe(10);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('records resolved-provider BYOK usage without requiring platform credits', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockResolvedValue({
      apiKey: 'replicate-org-key',
    });
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      'kling/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      amount: 10,
      byokApiKeyOverride: 'replicate-org-key',
      deferred: false,
      isByokBypass: true,
      modelKey: 'kling/model',
      provider: 'replicate',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('charges credits when only Replicate BYOK is active for Higgsfield DoP', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.REPLICATE
            ? { apiKey: 'replicate-org-key' }
            : undefined,
        ),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
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

  it('uses Higgsfield BYOK for DoP without charging platform credits', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(
          provider === ByokProvider.HIGGSFIELD
            ? { apiKey: 'higgsfield-org-key' }
            : undefined,
        ),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      byokApiKeyOverride: 'higgsfield-org-key',
      isByokBypass: true,
      provider: ByokProvider.HIGGSFIELD,
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('refuses a 10-segment clip-chain when the org can only afford 3 segments', async () => {
    const requiredCredits = estimateClipChainCredits(10);
    const affordableCredits = estimateClipChainCredits(3);
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
      affordableCredits,
    );
    const request = {
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    const error = await service
      .ensureClipChainCredits(
        10,
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        'org-1',
        request as never,
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toEqual({
      detail: `Insufficient credits: ${requiredCredits} required, ${affordableCredits} available`,
      title: 'Insufficient credits',
    });
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org-1', requiredCredits);
  });

  it('reserves the full N-segment clip-chain quote and leaves settlement deferred', async () => {
    const requiredCredits = estimateClipChainCredits(5);
    const request = {
      body: { sourceActionId: 'clip-chain-action-1' },
      creditsConfig: { deferred: true },
      user: { userId: 'user-1' },
    };

    await service.ensureClipChainCredits(
      5,
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      'org-1',
      request as never,
    );

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: requiredCredits }),
    );
    expect(request.creditsConfig).toMatchObject({
      amount: requiredCredits,
      deferred: true,
      reservationId: 'reservation-1',
    });
  });

  it('does not reserve clip-chain credits when BYOK is active', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.resolveApiKey.mockResolvedValue({
      apiKey: 'replicate-org-key',
    });
    const request = { creditsConfig: { deferred: true } };

    await service.ensureClipChainCredits(
      5,
      'kling/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      byokApiKeyOverride: 'replicate-org-key',
      deferred: true,
      isByokBypass: true,
      provider: 'replicate',
    });
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('settles a completed clip-chain once against the reservation', async () => {
    const reservedCredits = estimateClipChainCredits(5);

    await service.settleClipChainReservation({
      actualCredits: reservedCredits,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      reservedCredits,
    });

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledTimes(1);
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith({
      actualAmount: reservedCredits,
      actorUserId: 'user-1',
      description: 'Clip-chain video reservation settlement',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      source: ActivitySource.VIDEO_GENERATION,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
  });

  it('settles completed segments and releases the remainder when a run fails mid-chain', async () => {
    const reservedCredits = estimateClipChainCredits(5);
    const completedCredits = estimateClipChainCredits(1) - 1;

    await service.settleClipChainReservation({
      actualCredits: completedCredits,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      reservedCredits,
    });

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledTimes(1);
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: completedCredits,
        reservationId: 'reservation-1',
      }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('releases the clip-chain hold when no segment completed', async () => {
    await service.settleClipChainReservation({
      actualCredits: 0,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      reservedCredits: estimateClipChainCredits(5),
    });

    expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  // #5294 — the credit decision and the provider dispatch key must be
  // resolved from the same `resolveApiKey` call, so the charge and the
  // actual dispatch key can never disagree about who paid.
  describe('BYOK dispatch-key / credit-decision agreement (#5294)', () => {
    it('charges platform credits when GENFEED_AI hosted models run under an org Replicate key', async () => {
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.GENFEED_AI,
      });
      byokService.resolveApiKey.mockResolvedValue({
        apiKey: 'org-replicate-key',
      });
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        { duration: 5 } as never,
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
        provider: ModelProvider.REPLICATE,
      });
      byokService.resolveApiKey.mockResolvedValue(undefined);
      const request = {
        body: { sourceActionId: 'no-byok-key' },
        creditsConfig: { deferred: true },
        user: { userId: 'user-1' },
      };

      await service.ensureDeferredCredits(
        { duration: 5 } as never,
        'replicate/model',
        'org-1',
        request as never,
      );

      expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 10 }),
      );
      expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
      expect(request.creditsConfig).not.toHaveProperty('byokApiKeyOverride');
    });

    it('bypasses credits and carries the exact resolved key when a Replicate key is saved and active', async () => {
      modelsService.findOne.mockResolvedValue({
        cost: 10,
        provider: ModelProvider.REPLICATE,
      });
      byokService.resolveApiKey.mockResolvedValue({
        apiKey: 'replicate-org-key',
      });
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        { duration: 5 } as never,
        'replicate/model',
        'org-1',
        request as never,
      );

      expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
      expect(request.creditsConfig).toMatchObject({
        amount: 10,
        byokApiKeyOverride: 'replicate-org-key',
        isByokBypass: true,
        provider: ByokProvider.REPLICATE,
      });
    });
  });
});
