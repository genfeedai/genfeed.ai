import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ByokProvider, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
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
    providerFor: vi.fn(),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(),
    isByokBillingInGoodStanding: vi.fn(),
  };

  let service: ImageGenerationCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    providerRegistry.providerFor.mockReturnValue('fal');
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
    service = new ImageGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      providerRegistry as never,
      byokService as never,
    );
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

    expect(request.creditsConfig).toEqual({
      amount: 20,
      deferred: false,
      modelKey: 'fal/model',
      pricingMetadata: {
        marginMultiplier: 1,
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

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      amount: 20,
      expiresAt: expect.any(Date),
      idempotencyKey: 'generation:image-action-1',
      organizationId: 'org-1',
      workloadId: 'image-action-1',
      workloadType: 'generation',
    });
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
    byokService.isByokActiveForProvider.mockResolvedValue(true);
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
      isByokBypass: true,
      modelKey: 'fal/model',
      provider: 'fal',
    });
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
  });

  it('charges credits when only Replicate BYOK is active for Higgsfield Soul', async () => {
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
      { height: 1080, width: 1920 } as never,
      MODEL_KEYS.HIGGSFIELD_SOUL,
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

  it('uses Higgsfield BYOK for Soul without charging platform credits', async () => {
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
      { height: 1080, width: 1920 } as never,
      MODEL_KEYS.HIGGSFIELD_SOUL,
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
        marginMultiplier: 1,
        pricingType: 'flat',
        providerCostUsd: 0.15,
      },
    });
  });
});
