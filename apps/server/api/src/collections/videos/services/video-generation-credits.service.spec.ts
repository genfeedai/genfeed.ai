import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { ByokProvider, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideoGenerationCreditsService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(),
    isByokBillingInGoodStanding: vi.fn(),
  };

  let service: VideoGenerationCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    byokService.isByokActiveForProvider.mockResolvedValue(false);
    byokService.isByokBillingInGoodStanding.mockResolvedValue(true);
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
        marginMultiplier: 1,
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
    byokService.isByokActiveForProvider.mockResolvedValue(true);
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      'kling/model',
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      amount: 10,
      deferred: false,
      isByokBypass: true,
      modelKey: 'kling/model',
      provider: 'replicate',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('charges credits when only Replicate BYOK is active for Higgsfield Kling', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.isByokActiveForProvider.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(provider === ByokProvider.REPLICATE),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
      'org-1',
      request as never,
    );

    expect(byokService.isByokActiveForProvider).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.HIGGSFIELD,
    );
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith('org-1', 10);
    expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
  });

  it('uses Higgsfield BYOK for Kling without charging platform credits', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 10,
      provider: ModelProvider.REPLICATE,
    });
    byokService.isByokActiveForProvider.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(provider === ByokProvider.HIGGSFIELD),
    );
    const request = { creditsConfig: { deferred: true } };

    await service.ensureDeferredCredits(
      { duration: 5 } as never,
      MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
      'org-1',
      request as never,
    );

    expect(request.creditsConfig).toMatchObject({
      isByokBypass: true,
      provider: ByokProvider.HIGGSFIELD,
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });
});
