import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowContinuationReconcileService', () => {
  const continuations = { findReplicatePollCandidates: vi.fn() };
  const coordinator = {
    completeProviderAction: vi.fn(),
    failProviderAction: vi.fn(),
    reconcileProviderContinuations: vi.fn(),
  };
  const ingredients = { findOne: vi.fn() };
  const replicate = { getPrediction: vi.fn() };
  const webhooks = {
    handleFailedGenerationForIngredient: vi.fn(),
    processMediaForIngredient: vi.fn(),
  };
  const logger = { error: vi.fn() };
  let service: WorkflowContinuationReconcileService;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator.reconcileProviderContinuations.mockResolvedValue({
      failed: 0,
      pollsDispatched: 0,
      resumed: 0,
    });
    service = new WorkflowContinuationReconcileService(
      continuations as never,
      coordinator as never,
      ingredients as never,
      replicate as never,
      webhooks as never,
      logger as never,
    );
  });

  it('polls and finalizes a Replicate continuation by exact tenant identity', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-1',
        externalId: 'prediction-1',
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
      },
    ]);
    replicate.getPrediction.mockResolvedValue({
      output: 'https://replicate.delivery/pbxt/result.mp4',
      status: 'succeeded',
    });
    ingredients.findOne.mockResolvedValue({ category: 'VIDEO' });

    await service.reconcile();

    expect(ingredients.findOne).toHaveBeenCalledWith({
      id: 'ingredient-1',
      organizationId: 'org-1',
    });
    expect(webhooks.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'VIDEO',
      'https://replicate.delivery/pbxt/result.mp4',
      'prediction-1',
    );
    expect(coordinator.completeProviderAction).toHaveBeenCalledWith({
      identity: {
        continuationId: 'continuation-1',
        organizationId: 'org-1',
      },
      provider: 'replicate',
      providerResult: { externalId: 'prediction-1' },
    });
    expect(coordinator.reconcileProviderContinuations).toHaveBeenCalledTimes(2);
  });

  it('isolates a poison Replicate prediction and processes later candidates', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-poison',
        externalId: 'prediction-poison',
        ingredientId: 'ingredient-poison',
        organizationId: 'org-1',
      },
      {
        continuationId: 'continuation-healthy',
        externalId: 'prediction-healthy',
        ingredientId: 'ingredient-healthy',
        organizationId: 'org-1',
      },
    ]);
    replicate.getPrediction
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce({
        output: 'https://replicate.delivery/pbxt/result.mp4',
        status: 'succeeded',
      });
    ingredients.findOne.mockResolvedValue({ category: 'VIDEO' });

    await service.reconcile();

    expect(replicate.getPrediction).toHaveBeenCalledTimes(2);
    expect(webhooks.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-healthy',
      'VIDEO',
      'https://replicate.delivery/pbxt/result.mp4',
      'prediction-healthy',
    );
    expect(coordinator.completeProviderAction).toHaveBeenCalledWith({
      identity: {
        continuationId: 'continuation-healthy',
        organizationId: 'org-1',
      },
      provider: 'replicate',
      providerResult: { externalId: 'prediction-healthy' },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to reconcile Replicate continuation'),
      expect.any(Error),
      {
        continuationId: 'continuation-poison',
        organizationId: 'org-1',
      },
    );
  });
});
