vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class CreditsUtilsService {},
}));
vi.mock('@api/services/integrations/fal/fal.service', () => ({
  FalService: class FalService {},
}));
vi.mock('@api/services/integrations/leonardoai/leonardoai.service', () => ({
  LeonardoAIService: class LeonardoAIService {},
}));
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
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

describe('ManagedInferenceService', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
    refundOrganizationCredits: vi.fn(),
  } as unknown as CreditsUtilsService;

  const falService = {
    generateImage: vi.fn(),
  } as unknown as FalService;

  const leonardoAIService = {
    generateImage: vi.fn(),
  } as unknown as LeonardoAIService;

  const replicateService = {
    runModel: vi.fn(),
  } as unknown as ReplicateService;

  const loggerService = {
    error: vi.fn(),
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
      leonardoAIService,
      replicateService,
      loggerService,
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
      provider: ManagedInferenceProvider.FAL,
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      1,
      'Managed inference fal:fal-ai/flux/dev',
      ActivitySource.IMAGE_GENERATION,
    );
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
