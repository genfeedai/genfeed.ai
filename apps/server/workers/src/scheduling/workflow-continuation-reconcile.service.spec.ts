import { ByokProvider } from '@genfeedai/contracts';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowContinuationReconcileService', () => {
  const byok = { lookupApiKey: vi.fn() };
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
      byok as never,
    );
  });

  it('reads a BYOK continuation prediction with the organization key that created it', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-byok',
        externalId: 'prediction-byok',
        ingredientId: 'ingredient-byok',
        isByok: true,
        organizationId: 'org-1',
      },
    ]);
    byok.lookupApiKey.mockResolvedValue({ apiKey: 'org-replicate-key' });
    replicate.getPrediction.mockResolvedValue({ status: 'processing' });

    await service.reconcile();

    expect(byok.lookupApiKey).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.REPLICATE,
    );
    expect(replicate.getPrediction).toHaveBeenCalledWith(
      'prediction-byok',
      'org-replicate-key',
    );
  });

  it('skips a BYOK continuation for a later run when the key lookup errors, without failing it', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-byok',
        externalId: 'prediction-byok',
        ingredientId: 'ingredient-byok',
        isByok: true,
        organizationId: 'org-1',
      },
    ]);
    byok.lookupApiKey.mockRejectedValue(new Error('database unavailable'));

    await service.reconcile();

    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).not.toHaveBeenCalled();
    expect(coordinator.failProviderAction).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('reads a platform continuation prediction with the platform key', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-platform',
        externalId: 'prediction-platform',
        ingredientId: 'ingredient-platform',
        isByok: false,
        organizationId: 'org-1',
      },
    ]);
    replicate.getPrediction.mockResolvedValue({ status: 'processing' });

    await service.reconcile();

    expect(byok.lookupApiKey).not.toHaveBeenCalled();
    expect(replicate.getPrediction).toHaveBeenCalledWith(
      'prediction-platform',
      undefined,
    );
  });

  it('fails a BYOK continuation instead of polling with the platform key once the org key is gone', async () => {
    continuations.findReplicatePollCandidates.mockResolvedValue([
      {
        continuationId: 'continuation-byok',
        externalId: 'prediction-byok',
        ingredientId: 'ingredient-byok',
        isByok: true,
        organizationId: 'org-1',
      },
    ]);
    byok.lookupApiKey.mockResolvedValue(undefined);

    await service.reconcile();

    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-byok',
      expect.stringContaining('Replicate key'),
    );
    expect(coordinator.failProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          continuationId: 'continuation-byok',
          organizationId: 'org-1',
        },
        provider: 'replicate',
      }),
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
