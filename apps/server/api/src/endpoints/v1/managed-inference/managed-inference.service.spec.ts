vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class CreditsUtilsService {},
}));
vi.mock('@api/services/integrations/fal/fal.service', () => ({
  FalService: class FalService {},
}));
vi.mock('@api/services/integrations/fleet/fleet.service', () => ({
  FleetService: class FleetService {},
}));
vi.mock(
  '@server/services/integrations/leonardoai/services/leonardoai.service',
  () => ({
    LeonardoAIService: class LeonardoAIService {},
  }),
);
vi.mock('@api/services/integrations/replicate/replicate.service', () => ({
  ReplicateService: class ReplicateService {},
}));
vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: class LoggerService {},
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  ManagedInferenceOperation,
  ManagedInferenceProvider,
} from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type { ManagedInferenceAuthenticatedRequest } from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { ManagedInferenceService } from '@api/endpoints/v1/managed-inference/managed-inference.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';

describe('ManagedInferenceService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
    refundOrganizationCredits: vi.fn(),
  } as unknown as CreditsUtilsService;

  const falService = {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
  } as unknown as FalService;

  const fleetService = {
    generateManagedVideoForOrg: vi.fn(),
    hasDedicatedInstanceForOrg: vi.fn(),
    pollManagedJobForOrg: vi.fn(),
  } as unknown as FleetService;

  const leonardoAIService = {
    generateImage: vi.fn(),
  } as unknown as LeonardoAIService;

  const replicateService = {
    runModel: vi.fn(),
  } as unknown as ReplicateService;

  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const request = {
    user: {
      id: 'user-1',
      publicMetadata: {
        organization: 'org-1',
        user: 'user-1',
      },
    },
  } as ManagedInferenceAuthenticatedRequest;

  let service: ManagedInferenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ManagedInferenceService(
      creditsUtilsService,
      falService,
      fleetService,
      leonardoAIService,
      replicateService,
      loggerService,
      new PollUntilService(loggerService),
    );
  });

  it('debits credits and runs fal image inference', async () => {
    vi.mocked(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).mockResolvedValue(true);
    vi.mocked(falService.generateImage).mockResolvedValue({
      url: 'https://img.test/fal.jpg',
    });

    const result = await service.execute(
      {
        input: { prompt: 'test' },
        model: 'fal-ai/flux/dev',
        operation: ManagedInferenceOperation.IMAGE,
        provider: ManagedInferenceProvider.FAL,
      },
      request,
    );

    expect(result).toEqual({
      creditsDebited: 1,
      model: 'fal-ai/flux/dev',
      output: { url: 'https://img.test/fal.jpg' },
      operation: ManagedInferenceOperation.IMAGE,
      provider: ManagedInferenceProvider.FAL,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      1,
      'Managed inference image fal:fal-ai/flux/dev',
      ActivitySource.IMAGE_GENERATION,
    );
  });

  it('debits credits and runs fal video inference', async () => {
    vi.mocked(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).mockResolvedValue(true);
    vi.mocked(falService.generateVideo).mockResolvedValue({
      url: 'https://video.test/fal.mp4',
    });

    const result = await service.execute(
      {
        input: { prompt: 'video prompt' },
        model: 'fal-ai/kling-video/v1/standard/text-to-video',
        operation: ManagedInferenceOperation.VIDEO,
        provider: ManagedInferenceProvider.FAL,
      },
      request,
    );

    expect(result).toEqual({
      creditsDebited: 1,
      model: 'fal-ai/kling-video/v1/standard/text-to-video',
      operation: ManagedInferenceOperation.VIDEO,
      output: { url: 'https://video.test/fal.mp4' },
      provider: ManagedInferenceProvider.FAL,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      1,
      'Managed inference video fal:fal-ai/kling-video/v1/standard/text-to-video',
      ActivitySource.VIDEO_GENERATION,
    );
  });

  it('runs genfeedai video inference only when enabled for the organization', async () => {
    vi.mocked(fleetService.hasDedicatedInstanceForOrg).mockResolvedValue(true);
    vi.mocked(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).mockResolvedValue(true);
    vi.mocked(fleetService.generateManagedVideoForOrg).mockResolvedValue({
      jobId: 'job-1',
    });
    vi.mocked(fleetService.pollManagedJobForOrg).mockResolvedValue({
      output: { video_url: 'https://video.test/genfeed.mp4' },
      status: 'completed',
    });

    const result = await service.execute(
      {
        input: {
          imageUrl: 'https://img.test/source.jpg',
          prompt: 'cinematic pan',
        },
        model: 'genfeedai/wan-i2v-lora',
        operation: ManagedInferenceOperation.VIDEO,
        provider: ManagedInferenceProvider.GENFEEDAI,
      },
      request,
    );

    expect(result.output).toEqual({
      jobId: 'job-1',
      url: 'https://video.test/genfeed.mp4',
    });
    expect(fleetService.generateManagedVideoForOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://img.test/source.jpg',
        organizationId: 'org-1',
        prompt: 'cinematic pan',
      }),
    );
  });

  it('rejects genfeedai video before debit when provider is not enabled', async () => {
    vi.mocked(fleetService.hasDedicatedInstanceForOrg).mockResolvedValue(false);

    await expect(
      service.execute(
        {
          input: {
            imageUrl: 'https://img.test/source.jpg',
            prompt: 'cinematic pan',
          },
          model: 'genfeedai/wan-i2v-lora',
          operation: ManagedInferenceOperation.VIDEO,
          provider: ManagedInferenceProvider.GENFEEDAI,
        },
        request,
      ),
    ).rejects.toHaveProperty('status', 403);

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('returns 402 before debit when managed credits are insufficient', async () => {
    vi.mocked(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).mockResolvedValue(false);

    await expect(
      service.execute(
        {
          credits: 2,
          input: { prompt: 'test' },
          model: 'fal-ai/flux/dev',
          operation: ManagedInferenceOperation.IMAGE,
          provider: ManagedInferenceProvider.FAL,
        },
        request,
      ),
    ).rejects.toHaveProperty('status', 402);

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('refunds credits when provider execution fails after debit', async () => {
    vi.mocked(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).mockResolvedValue(true);
    vi.mocked(falService.generateImage).mockRejectedValue(
      new Error('provider failed'),
    );

    await expect(
      service.execute(
        {
          input: { prompt: 'test' },
          model: 'fal-ai/flux/dev',
          operation: ManagedInferenceOperation.IMAGE,
          provider: ManagedInferenceProvider.FAL,
        },
        request,
      ),
    ).rejects.toThrow('provider failed');

    expect(creditsUtilsService.refundOrganizationCredits).toHaveBeenCalledWith(
      'org-1',
      1,
      'managed_inference',
      'Managed inference refund fal:fal-ai/flux/dev',
      expect.any(Date),
    );
  });
});
