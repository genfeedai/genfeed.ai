import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { AgentFailureReason, IngredientCategory } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

function buildContext(
  overrides: Partial<VideoGenerationContext> = {},
): VideoGenerationContext {
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
    ...overrides,
  } as unknown as VideoGenerationContext;
}

describe('VideoGenerationExecutionService', () => {
  function createHarness() {
    const activitiesService = {
      record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const generationBilling = {
      bindOutput: vi.fn().mockResolvedValue(undefined),
      hasPool: vi.fn().mockReturnValue(false),
      releaseOutput: vi.fn().mockResolvedValue('no-hold'),
      releasePool: vi.fn().mockResolvedValue(undefined),
      settleOutput: vi.fn().mockResolvedValue('no-hold'),
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
    const webhooksService = {
      processMediaForIngredient: vi.fn().mockResolvedValue(undefined),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };

    const service = new VideoGenerationExecutionService(
      activitiesService as never,
      failedGenerationService as never,
      generationBilling as never,
      loggerService as never,
      metadataService as never,
      providerDispatchService as never,
      replicatePollQueueService as never,
      sharedService as never,
      videosService as never,
      websocketService as never,
      webhooksService as never,
    );

    return {
      generationBilling,
      webhooksService,
      providerDispatchService,
      replicatePollQueueService,
      sharedService,
      failedGenerationService,
      service,
    };
  }

  it('keeps an earlier accepted output funded when a later sequential dispatch fails', async () => {
    const {
      service,
      generationBilling,
      providerDispatchService,
      sharedService,
      failedGenerationService,
    } = createHarness();
    const failure = new Error('second dispatch rejected');
    providerDispatchService.dispatch
      .mockResolvedValueOnce({
        completion: 'polling',
        externalId: 'ext-first',
        provider: 'replicate',
      })
      .mockRejectedValueOnce(failure);
    sharedService.createMediaDocuments.mockResolvedValue({
      ingredientData: { id: 'ingredient-2' },
      metadataData: { id: 'metadata-2' },
    });
    await expect(
      service.execute(
        buildContext({
          createVideoDto: { outputs: 2 } as never,
          pendingIngredientIds: ['ingredient-1'],
          request: {
            creditsConfig: {
              amount: 6,
              settlement: 'completion',
              reservationId: 'pool-1',
            },
          } as never,
        }),
      ),
    ).rejects.toBe(failure);
    expect(generationBilling.releaseOutput).toHaveBeenCalledWith(
      'ingredient-2',
      'org-1',
    );
    expect(generationBilling.releaseOutput).not.toHaveBeenCalledWith(
      'ingredient-1',
      'org-1',
    );
    expect(
      failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalledTimes(1);
  });

  it.each(['fal', 'higgsfield'])(
    'finalizes a completed %s video after binding its hold',
    async (provider) => {
      const {
        service,
        generationBilling,
        providerDispatchService,
        webhooksService,
      } = createHarness();
      const url = 'https://provider.example/output.mp4';
      providerDispatchService.dispatch.mockResolvedValue({
        completion: 'remote-output',
        externalId: url,
        provider,
      });
      generationBilling.hasPool.mockReturnValue(true);
      const context = buildContext({
        pendingIngredientIds: ['ingredient-1'],
        request: {
          creditsConfig: {
            amount: 6,
            settlement: 'completion',
            reservationId: 'pool-1',
          },
        } as never,
      });
      await service.execute(context);
      expect(webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
        'ingredient-1',
        IngredientCategory.VIDEO,
        url,
        url,
      );
      expect(
        generationBilling.bindOutput.mock.invocationCallOrder[0],
      ).toBeLessThan(
        webhooksService.processMediaForIngredient.mock.invocationCallOrder[0],
      );
      expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
    },
  );

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

  // #5294 the resolved BYOK key set on `request.creditsConfig` by
  // VideoGenerationCreditsService must reach the provider dispatch call —
  // otherwise the credit bypass and the actual dispatch key disagree.
  it('forwards the resolved BYOK apiKeyOverride from creditsConfig into the dispatch call', async () => {
    const { providerDispatchService, service } = createHarness();
    providerDispatchService.dispatch.mockResolvedValue({
      completion: 'polling',
      externalId: 'ext-byok-1',
      provider: 'replicate',
    });
    const context = buildContext({
      request: {
        creditsConfig: {
          byokApiKeyOverride: 'org-replicate-key',
          isByokBypass: true,
          provider: 'replicate',
        },
      } as never,
    });

    await service.execute(context);

    expect(providerDispatchService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyOverride: 'org-replicate-key' }),
    );
  });

  it('marks the polling fallback as BYOK so completion reads the prediction with the org key', async () => {
    const { providerDispatchService, replicatePollQueueService, service } =
      createHarness();
    providerDispatchService.dispatch.mockResolvedValue({
      completion: 'polling',
      externalId: 'ext-byok-1',
      provider: 'replicate',
    });
    const context = buildContext({
      request: {
        creditsConfig: {
          byokApiKeyOverride: 'org-replicate-key',
          isByokBypass: true,
          provider: 'replicate',
        },
      } as never,
    });

    await service.execute(context);

    expect(replicatePollQueueService.schedule).toHaveBeenCalledWith({
      category: IngredientCategory.VIDEO,
      externalId: 'ext-byok-1',
      ingredientId: 'ingredient-1',
      isByok: true,
      organizationId: 'org-1',
    });
    expect(
      JSON.stringify(replicatePollQueueService.schedule.mock.calls),
    ).not.toContain('org-replicate-key');
  });

  it('dispatches with no apiKeyOverride when the request carries no BYOK bypass', async () => {
    const { providerDispatchService, replicatePollQueueService, service } =
      createHarness();
    providerDispatchService.dispatch.mockResolvedValue({
      completion: 'polling',
      externalId: 'ext-platform-1',
      provider: 'replicate',
    });

    await service.execute(buildContext());

    expect(providerDispatchService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyOverride: undefined }),
    );
    expect(replicatePollQueueService.schedule).toHaveBeenCalledWith(
      expect.not.objectContaining({ isByok: true }),
    );
  });
});
