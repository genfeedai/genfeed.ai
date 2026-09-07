import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { AgentFailureReason } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

function buildContext(): VideoGenerationContext {
  return {
    brand: { id: 'brand-1', organizationId: 'org-1' },
    createVideoDto: { outputs: 1 },
    height: 1080,
    ingredientData: { id: 'ingredient-1' },
    metadataData: { id: 'metadata-1' },
    model: 'replicate/model',
    pendingIngredientIds: [],
    promptData: { id: 'prompt-1', original: 'prompt' },
    promptInput: { prompt: 'a video' },
    promptParams: { prompt: 'a video' },
    referenceImageUrls: [],
    referenceIds: [],
    user: { id: 'user-1', organizationId: 'org-1', userId: 'user-1' },
    width: 1920,
  } as unknown as VideoGenerationContext;
}

describe('VideoGenerationExecutionService', () => {
  function createHarness() {
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const loggerService = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };
    const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    const providerDispatchService = {
      dispatch: vi.fn(),
      providerFor: vi.fn().mockReturnValue('replicate'),
    };
    const replicatePollQueueService = { schedule: vi.fn() };
    const sharedService = { createMediaDocuments: vi.fn() };
    const videosService = { patch: vi.fn() };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };

    const service = new VideoGenerationExecutionService(
      activitiesService as never,
      failedGenerationService as never,
      loggerService as never,
      metadataService as never,
      providerDispatchService as never,
      replicatePollQueueService as never,
      sharedService as never,
      videosService as never,
      websocketService as never,
    );

    return { providerDispatchService, service };
  }

  it('maps a Replicate 402 insufficient-credit failure to a 4xx/502 HttpException, never a raw 500', async () => {
    const { providerDispatchService, service } = createHarness();
    const providerError = new ReplicateProviderError(
      AgentFailureReason.INSUFFICIENT_CREDITS,
      'Replicate rejected the request due to insufficient credit.',
      { isRetryable: false, statusCode: 402 },
    );
    providerDispatchService.dispatch.mockRejectedValue(providerError);

    const thrown: unknown = await service
      .execute(buildContext())
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(HttpException);
    const httpError = thrown as HttpException;
    expect(httpError.getStatus()).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(httpError.getResponse()).toEqual(
      expect.objectContaining({
        detail: expect.stringContaining('Replicate'),
        title: 'Provider out of credit',
      }),
    );
  });

  it('rethrows an unrelated error unchanged', async () => {
    const { providerDispatchService, service } = createHarness();
    const genericError = new Error('unrelated failure');
    providerDispatchService.dispatch.mockRejectedValue(genericError);

    await expect(service.execute(buildContext())).rejects.toBe(genericError);
  });
});
