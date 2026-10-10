import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { AgentFailureReason, IngredientCategory } from '@genfeedai/contracts';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
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
      notifyFailedGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const generationBilling = {
      recordProviderCompletion: vi.fn().mockResolvedValue(undefined),
      bindOutput: vi.fn().mockResolvedValue(undefined),
      hasPool: vi.fn().mockReturnValue(false),
      releaseOutput: vi.fn().mockResolvedValue('no-hold'),
      releasePool: vi.fn().mockResolvedValue(undefined),
      rememberAcceptedOutput: vi.fn().mockResolvedValue(undefined),
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
    const videosService = {
      patch: vi.fn(),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const webhooksService = {
      processMediaForIngredient: vi.fn().mockResolvedValue(undefined),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };

    const mediaReceipts = {
      open: vi.fn().mockResolvedValue(undefined),
      recordAccepted: vi.fn().mockResolvedValue(undefined),
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
      mediaReceipts as never,
    );

    return {
      mediaReceipts,
      generationBilling,
      metadataService,
      videosService,
      webhooksService,
      providerDispatchService,
      replicatePollQueueService,
      sharedService,
      failedGenerationService,
      service,
    };
  }

  it.each([
    'pre-dispatch',
    'metadata-write',
    'adapter-preflight',
    'credit-rejection',
    'ambiguous-submission',
  ])(
    'closes only proven non-submission, preserving a group after %s failure',
    async (path) => {
      const state = createHarness();
      const quote = quoteModelBillablePricing(
        billableProfile(),
        {
          modelKey: 'test/model',
          provider: 'replicate',
          outputs: 1,
          requests: 1,
        },
        1,
        '2026-09-30T00:00:00.000Z',
      );
      if (quote.status !== 'priced') throw new Error(quote.reason);
      const context = buildContext({
        pendingIngredientIds: ['ingredient-1'],
        request: {
          creditsConfig: {
            modelQuote: quote.snapshot,
            amount: quote.snapshot.credits,
            settlement: 'completion',
            reservationId: 'hold-1',
          },
        } as never,
      });
      const error =
        path === 'credit-rejection'
          ? new ReplicateProviderError(
              AgentFailureReason.INSUFFICIENT_CREDITS,
              'rejected',
              { statusCode: 402, isRetryable: false },
            )
          : new Error('failure');
      if (path === 'pre-dispatch')
        await expect(
          state.service.failPlaceholderBeforeDispatch(context, error),
        ).rejects.toBe(error);
      else {
        if (path === 'metadata-write')
          state.metadataService.patch.mockRejectedValueOnce(error);
        else
          state.providerDispatchService.dispatch.mockImplementation(
            async (params) => {
              if (path !== 'adapter-preflight')
                params.onProviderSubmissionStarted();
              throw error;
            },
          );
        if (path === 'credit-rejection')
          await expect(state.service.execute(context)).rejects.toBeInstanceOf(
            HttpException,
          );
        else await expect(state.service.execute(context)).rejects.toBe(error);
      }
      if (path !== 'ambiguous-submission') {
        if (path === 'metadata-write')
          expect(state.providerDispatchService.dispatch).not.toHaveBeenCalled();
        expect(state.videosService.patchAll).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'PROCESSING' }),
          expect.objectContaining({
            status: 'FAILED',
            isGenerationFailureConfirmed: true,
          }),
        );
        expect(
          state.generationBilling.releaseOutput,
        ).toHaveBeenCalledExactlyOnceWith('ingredient-1', 'org-1');
        expect(
          state.videosService.patchAll.mock.invocationCallOrder[0],
        ).toBeLessThan(
          state.generationBilling.releaseOutput.mock.invocationCallOrder[0],
        );
      } else {
        expect(state.videosService.patchAll).not.toHaveBeenCalled();
        expect(state.generationBilling.releaseOutput).not.toHaveBeenCalled();
      }
      expect(
        state.failedGenerationService.handleFailedVideoGeneration,
      ).not.toHaveBeenCalled();
      if (path === 'pre-dispatch')
        expect(
          state.generationBilling.releasePool,
        ).toHaveBeenCalledExactlyOnceWith(context.request);
      else expect(state.generationBilling.releasePool).not.toHaveBeenCalled();
    },
  );

  it('closes unbound request admission even when no output was bound', async () => {
    const state = createHarness();
    const context = buildContext({
      request: {
        creditsConfig: { reservationId: 'hold-1', settlement: 'completion' },
        user: { organizationId: 'org-1', userId: 'user-1' },
      } as never,
    });
    const error = new Error('reference changed before dispatch');

    await expect(
      state.service.failPlaceholderBeforeDispatch(context, error),
    ).rejects.toBe(error);

    expect(state.generationBilling.releasePool).toHaveBeenCalledExactlyOnceWith(
      context.request,
    );
    expect(state.generationBilling.bindOutput).not.toHaveBeenCalled();
    expect(state.providerDispatchService.dispatch).not.toHaveBeenCalled();
    expect(state.generationBilling.releaseOutput).not.toHaveBeenCalled();
  });

  it('closes unused admission when failure projection itself fails before dispatch', async () => {
    const state = createHarness();
    const projectionError = new Error('failure projection unavailable');
    state.failedGenerationService.handleFailedVideoGeneration.mockRejectedValue(
      projectionError,
    );
    const context = buildContext({
      pendingIngredientIds: ['ingredient-1'],
      request: { creditsConfig: { reservationId: 'hold-1' } } as never,
    });

    await expect(
      state.service.failPlaceholderBeforeDispatch(
        context,
        new Error('reference changed'),
      ),
    ).rejects.toBe(projectionError);

    expect(state.generationBilling.releasePool).toHaveBeenCalledExactlyOnceWith(
      context.request,
    );
    expect(state.providerDispatchService.dispatch).not.toHaveBeenCalled();
  });

  it('does not close a request after an ambiguous provider submission', async () => {
    const state = createHarness();
    const quote = quoteModelBillablePricing(
      billableProfile(),
      {
        modelKey: 'test/model',
        provider: 'replicate',
        outputs: 1,
        requests: 1,
      },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    const context = buildContext({
      pendingIngredientIds: ['ingredient-1'],
      request: {
        creditsConfig: {
          modelQuote: quote.snapshot,
          amount: quote.snapshot.credits,
          settlement: 'completion',
          reservationId: 'hold-1',
        },
      } as never,
    });
    const failure = new Error('provider submission outcome unknown');
    state.providerDispatchService.dispatch.mockImplementation(
      async (params) => {
        params.onProviderSubmissionStarted();
        throw failure;
      },
    );
    await expect(state.service.execute(context)).rejects.toBe(failure);

    await expect(
      state.service.failPlaceholderBeforeDispatch(context, failure),
    ).rejects.toBe(failure);

    expect(state.generationBilling.releasePool).not.toHaveBeenCalled();
    expect(state.generationBilling.releaseOutput).not.toHaveBeenCalled();
  });

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

  it('funds every sequential dispatch before the provider accepts it', async () => {
    const {
      service,
      generationBilling,
      providerDispatchService,
      sharedService,
    } = createHarness();
    sharedService.createMediaDocuments.mockResolvedValue({
      ingredientData: { id: 'ingredient-2' },
      metadataData: { id: 'metadata-2' },
    });
    providerDispatchService.dispatch.mockImplementation(async () => {
      expect(generationBilling.bindOutput).toHaveBeenCalledTimes(
        providerDispatchService.dispatch.mock.calls.length,
      );
      return {
        completion: 'polling',
        externalId: 'accepted',
        provider: 'replicate',
      };
    });
    await service.execute(
      buildContext({
        createVideoDto: { outputs: 2 } as never,
        pendingIngredientIds: ['ingredient-1'],
        request: { creditsConfig: { amount: 6 } } as never,
      }),
    );
    expect(
      generationBilling.bindOutput.mock.calls.map(([, output]) => output),
    ).toEqual([
      { credits: 3, ingredientId: 'ingredient-1' },
      { credits: 3, ingredientId: 'ingredient-2' },
    ]);
  });

  it('opens one receipt per admitted output and records each acceptance without waiting on receipt writes', async () => {
    const { service, mediaReceipts, providerDispatchService, sharedService } =
      createHarness();
    // A receipt write that never settles must not hold back dispatch.
    mediaReceipts.open.mockReturnValue(new Promise(() => undefined));
    mediaReceipts.recordAccepted.mockReturnValue(new Promise(() => undefined));
    sharedService.createMediaDocuments.mockResolvedValue({
      ingredientData: { id: 'ingredient-2' },
      metadataData: { id: 'metadata-2' },
    });
    providerDispatchService.dispatch.mockImplementation(async () => {
      expect(mediaReceipts.open).toHaveBeenCalledTimes(
        providerDispatchService.dispatch.mock.calls.length,
      );
      return {
        completion: 'polling',
        externalId: `accepted-${providerDispatchService.dispatch.mock.calls.length}`,
        provider: 'replicate',
      };
    });

    await service.execute(
      buildContext({
        createVideoDto: { outputs: 2, text: 'typed prompt' } as never,
        generationHarness: {
          originalPrompt: 'typed prompt',
          enhancedPrompt: 'enhanced prompt',
          status: 'applied',
          source: 'brand',
          brandId: 'brand-1',
          appliedPacks: [],
        },
        pendingIngredientIds: ['ingredient-1'],
      }),
    );

    expect(mediaReceipts.open.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        actorId: 'user-1',
        ingredientId: 'ingredient-1',
        parentIngredientId: 'ingredient-1',
        mediaKind: 'video',
        provider: 'replicate',
        model: 'replicate/model',
        originalPrompt: 'typed prompt',
        enhancedPrompt: 'enhanced prompt',
        compiledPrompt: 'a video',
        generationParameters: { width: 1920, height: 1080, outputs: 2 },
      }),
      expect.objectContaining({
        ingredientId: 'ingredient-2',
        parentIngredientId: 'ingredient-1',
      }),
    ]);
    expect(
      mediaReceipts.recordAccepted.mock.calls.map(([input]) => input),
    ).toEqual([
      {
        organizationId: 'org-1',
        ingredientId: 'ingredient-1',
        provider: 'replicate',
        model: 'replicate/model',
        externalId: 'accepted-1',
      },
      {
        organizationId: 'org-1',
        ingredientId: 'ingredient-2',
        provider: 'replicate',
        model: 'replicate/model',
        externalId: 'accepted-2',
      },
    ]);
  });

  it('recovers accepted identity after a metadata outage without failing or releasing the output', async () => {
    const {
      service,
      generationBilling,
      providerDispatchService,
      metadataService,
      failedGenerationService,
    } = createHarness();
    providerDispatchService.dispatch.mockResolvedValue({
      completion: 'polling',
      externalId: 'accepted-id',
      provider: 'replicate',
    });
    metadataService.patch.mockImplementation(async (_id, metadata) => {
      if (metadata.externalId) throw new Error('metadata unavailable');
    });
    await service.execute(
      buildContext({
        pendingIngredientIds: ['ingredient-1'],
        request: { creditsConfig: { amount: 6 } } as never,
      }),
    );
    expect(generationBilling.rememberAcceptedOutput).toHaveBeenCalledWith({
      ingredientId: 'ingredient-1',
      externalId: 'accepted-id',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
    expect(
      failedGenerationService.handleFailedVideoGeneration,
    ).not.toHaveBeenCalled();
  });

  it('retains accepted funding even when metadata and attachment recovery are both unavailable', async () => {
    const {
      service,
      generationBilling,
      providerDispatchService,
      metadataService,
    } = createHarness();
    providerDispatchService.dispatch.mockResolvedValue({
      completion: 'polling',
      externalId: 'accepted-id',
      provider: 'replicate',
    });
    metadataService.patch.mockImplementation(async (_id, metadata) => {
      if (metadata.externalId) throw new Error('metadata unavailable');
    });
    generationBilling.rememberAcceptedOutput.mockRejectedValue(
      new Error('queue unavailable'),
    );
    await service.execute(
      buildContext({ pendingIngredientIds: ['ingredient-1'] }),
    );
    expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
  });

  it('persists the actual Fal receipt before artifact finalization rather than copying requested dimensions', async () => {
    const state = createHarness();
    const actual = { width: 1280, height: 720, duration: 3 };
    state.providerDispatchService.dispatch.mockResolvedValue({
      completion: 'remote-output',
      externalId: 'https://provider.example/output.mp4',
      provider: 'fal',
      completionQuantities: actual,
    });
    const context = buildContext({
      model: 'test/model',
      createVideoDto: { duration: 5 } as never,
    });
    state.webhooksService.processMediaForIngredient.mockImplementation(
      async () => {
        expect(
          state.generationBilling.recordProviderCompletion,
        ).toHaveBeenCalledExactlyOnceWith({
          ingredientId: 'ingredient-1',
          organizationId: 'org-1',
          externalId: 'https://provider.example/output.mp4',
          provider: 'fal',
          modelKey: 'test/model',
          quantities: actual,
        });
      },
    );
    await state.service.execute(context);
    expect(state.generationBilling.releaseOutput).not.toHaveBeenCalled();
    expect(
      state.generationBilling.recordProviderCompletion.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      state.webhooksService.processMediaForIngredient.mock
        .invocationCallOrder[0],
    );
  });

  it('does not substitute requested quantities when the actual Fal response lacks evidence', async () => {
    const state = createHarness();
    state.providerDispatchService.dispatch.mockResolvedValue({
      completion: 'remote-output',
      externalId: 'https://provider.example/output.mp4',
      provider: 'fal',
    });
    await state.service.execute(
      buildContext({ createVideoDto: { duration: 5 } as never }),
    );
    expect(
      state.generationBilling.recordProviderCompletion,
    ).not.toHaveBeenCalled();
    expect(
      state.webhooksService.processMediaForIngredient,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps the accepted artifact available and its funding retained when receipt persistence fails', async () => {
    const state = createHarness();
    state.providerDispatchService.dispatch.mockResolvedValue({
      completion: 'remote-output',
      externalId: 'https://provider.example/output.mp4',
      provider: 'fal',
      completionQuantities: { width: 1280, height: 720, duration: 3 },
    });
    state.generationBilling.recordProviderCompletion.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    await state.service.execute(
      buildContext({ pendingIngredientIds: ['ingredient-1'] }),
    );
    expect(
      state.generationBilling.recordProviderCompletion,
    ).toHaveBeenCalledTimes(1);
    expect(
      state.webhooksService.processMediaForIngredient,
    ).toHaveBeenCalledTimes(1);
    expect(state.generationBilling.releaseOutput).not.toHaveBeenCalled();
    expect(
      state.failedGenerationService.handleFailedVideoGeneration,
    ).not.toHaveBeenCalled();
  });

  it('leaves non-Fal completion on its existing financial owner even with result dimensions', async () => {
    const state = createHarness();
    state.providerDispatchService.dispatch.mockResolvedValue({
      completion: 'remote-output',
      externalId: 'https://provider.example/output.mp4',
      provider: 'heygen',
      completionQuantities: { width: 1280, height: 720, duration: 3 },
    });
    await state.service.execute(buildContext());
    expect(
      state.generationBilling.recordProviderCompletion,
    ).not.toHaveBeenCalled();
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
