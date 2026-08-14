import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ImageGenerationCreditsService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };
  const providerRegistry = {
    providerFor: vi.fn(),
  };

  let service: ImageGenerationCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    providerRegistry.providerFor.mockReturnValue('fal');
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    service = new ImageGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      providerRegistry as never,
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
    });
  });
});
