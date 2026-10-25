import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { IngredientGenerationCancellationService } from './ingredient-generation-cancellation.service';

describe('IngredientGenerationCancellationService', () => {
  const ingredientsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    patchAll: vi.fn(),
  };
  const failedGenerationService = {
    handleFailedGeneration: vi.fn().mockResolvedValue(undefined),
    notifyFailedGeneration: vi.fn().mockResolvedValue(undefined),
  };
  const loggerService = {
    warn: vi.fn(),
  } as unknown as LoggerService;
  const replicateService = {
    cancelPrediction: vi.fn().mockResolvedValue(undefined),
    getPrediction: vi.fn().mockResolvedValue({ status: 'processing' }),
  };

  const service = new IngredientGenerationCancellationService(
    failedGenerationService as never,
    ingredientsService as never,
    loggerService,
    replicateService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    failedGenerationService.handleFailedGeneration.mockResolvedValue(undefined);
    replicateService.cancelPrediction.mockResolvedValue(undefined);
    ingredientsService.patchAll.mockResolvedValue({ modifiedCount: 1 });
  });

  it('throws when the ingredient is missing', async () => {
    ingredientsService.findOne.mockResolvedValue(null);

    await expect(
      service.cancelProcessingIngredient({
        id: 'ing-1',
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a no-op when the ingredient is already terminal', async () => {
    const generated = {
      category: IngredientCategory.IMAGE,
      id: 'ing-1',
      status: IngredientStatus.GENERATED,
    };
    ingredientsService.findOne.mockResolvedValue(generated);

    await expect(
      service.cancelProcessingIngredient({
        id: 'ing-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(generated);

    expect(replicateService.cancelPrediction).not.toHaveBeenCalled();
    expect(
      failedGenerationService.handleFailedGeneration,
    ).not.toHaveBeenCalled();
  });

  it('cancels the Replicate prediction and marks the placeholder failed', async () => {
    const processing = {
      category: IngredientCategory.IMAGE,
      id: 'ing-1',
      metadata: {
        externalId: 'pred-99_0',
        externalProvider: 'replicate',
      },
      status: IngredientStatus.PROCESSING,
    };
    const cancelled = {
      ...processing,
      generationError: GENERATION_CANCELLED_BY_USER,
      status: IngredientStatus.FAILED,
    };
    ingredientsService.findOne
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(cancelled);

    await expect(
      service.cancelProcessingIngredient({
        id: 'ing-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toEqual(cancelled);

    expect(replicateService.cancelPrediction).toHaveBeenCalledWith('pred-99');
    expect(failedGenerationService.notifyFailedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'ing-1',
        websocketMessage: GENERATION_CANCELLED_BY_USER,
        websocketUrl: '/images/ing-1',
      }),
    );
  });

  it('still marks cancelled when the provider cancel call fails', async () => {
    ingredientsService.findOne.mockResolvedValue({
      category: IngredientCategory.VIDEO,
      id: 'vid-1',
      metadata: {
        externalId: 'pred-1',
        externalProvider: 'replicate',
      },
      status: IngredientStatus.PROCESSING,
    });
    replicateService.cancelPrediction.mockRejectedValueOnce(
      new Error('already ended'),
    );

    await service.cancelProcessingIngredient({
      id: 'vid-1',
      organizationId: 'org-1',
    });

    expect(failedGenerationService.notifyFailedGeneration).toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it.each(['network-outage', 'provider-still-processing'])(
    'retains funded processing and permits late completion when cancellation is %s',
    async (outcome) => {
      const processing = {
        id: 'image-1',
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.PROCESSING,
        generationBilling: {
          kind: 'quote-group',
          reservationId: 'hold-1',
          outputIndex: 0,
        },
        metadata: { externalId: 'prediction-1', externalProvider: 'replicate' },
      };
      ingredientsService.findOne.mockResolvedValue(processing);
      if (outcome === 'network-outage')
        replicateService.cancelPrediction.mockRejectedValueOnce(
          new Error('network unavailable'),
        );
      else
        replicateService.getPrediction.mockResolvedValueOnce({
          status: 'processing',
        });
      await expect(
        service.cancelProcessingIngredient({
          id: 'image-1',
          organizationId: 'org-1',
        }),
      ).resolves.toBe(processing);
      expect(ingredientsService.patchAll).not.toHaveBeenCalled();
      expect(
        failedGenerationService.handleFailedGeneration,
      ).not.toHaveBeenCalled();
    },
  );

  it('preserves a completed output when completion wins during provider cancellation', async () => {
    const processing = {
      id: 'image-1',
      category: IngredientCategory.IMAGE,
      status: IngredientStatus.PROCESSING,
      metadata: { externalId: 'prediction-1', externalProvider: 'replicate' },
    };
    const completed = { ...processing, status: IngredientStatus.GENERATED };
    // The old unconditional failure path would overwrite the completed row.
    failedGenerationService.handleFailedGeneration.mockImplementationOnce(
      async () => {
        ingredientsService.findOne.mockReset().mockResolvedValue({
          ...processing,
          status: IngredientStatus.FAILED,
          generationError: GENERATION_CANCELLED_BY_USER,
        });
      },
    );
    ingredientsService.findOne
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(completed);
    ingredientsService.patchAll.mockResolvedValueOnce({ modifiedCount: 0 });

    await expect(
      service.cancelProcessingIngredient({
        id: 'image-1',
        organizationId: 'org-1',
      }),
    ).resolves.toEqual(completed);

    expect(ingredientsService.patchAll).toHaveBeenCalledWith(
      {
        id: 'image-1',
        organizationId: 'org-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      {
        generationError: GENERATION_CANCELLED_BY_USER,
        status: IngredientStatus.FAILED,
      },
    );
    expect(
      failedGenerationService.handleFailedGeneration,
    ).not.toHaveBeenCalled();
    expect(
      failedGenerationService.notifyFailedGeneration,
    ).not.toHaveBeenCalled();
  });

  it('publishes cancellation only for the request that claims the processing output', async () => {
    const processing = {
      id: 'image-1',
      category: IngredientCategory.IMAGE,
      status: IngredientStatus.PROCESSING,
      metadata: { externalId: 'prediction-1', externalProvider: 'replicate' },
    };
    ingredientsService.findOne.mockResolvedValue(processing);
    ingredientsService.patchAll
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });

    await Promise.all(
      [1, 2].map(() =>
        service.cancelProcessingIngredient({
          id: 'image-1',
          organizationId: 'org-1',
        }),
      ),
    );

    expect(
      failedGenerationService.notifyFailedGeneration,
    ).toHaveBeenCalledOnce();
    expect(
      failedGenerationService.handleFailedGeneration,
    ).not.toHaveBeenCalled();
  });

  it('cancels immediately when the abort signal has already fired', () => {
    const abort = new AbortController();
    abort.abort();
    vi.spyOn(service, 'cancelProcessingIngredient').mockResolvedValue(
      {} as never,
    );

    service.bindCancelOnAbort({
      abortSignal: abort.signal,
      id: 'ing-1',
      organizationId: 'org-1',
    });

    expect(service.cancelProcessingIngredient).toHaveBeenCalledWith({
      abortSignal: abort.signal,
      id: 'ing-1',
      organizationId: 'org-1',
    });
  });
});
