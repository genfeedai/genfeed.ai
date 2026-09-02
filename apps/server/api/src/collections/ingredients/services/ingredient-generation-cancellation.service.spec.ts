import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { IngredientGenerationCancellationService } from './ingredient-generation-cancellation.service';

describe('IngredientGenerationCancellationService', () => {
  const ingredientsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const failedGenerationService = {
    handleFailedGeneration: vi.fn().mockResolvedValue(undefined),
  };
  const loggerService = {
    warn: vi.fn(),
  } as unknown as LoggerService;
  const replicateService = {
    cancelPrediction: vi.fn().mockResolvedValue(undefined),
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
    expect(failedGenerationService.handleFailedGeneration).toHaveBeenCalledWith(
      ingredientsService,
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

    expect(failedGenerationService.handleFailedGeneration).toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalled();
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
