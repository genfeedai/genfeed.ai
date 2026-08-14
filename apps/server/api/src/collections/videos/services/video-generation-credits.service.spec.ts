import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideoGenerationCreditsService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };

  let service: VideoGenerationCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue({ cost: 10 });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    service = new VideoGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
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
});
