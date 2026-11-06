import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import type { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Candidate {
  continuationId: string;
  externalId: string;
  ingredientId: string;
  isByok?: boolean;
  organizationId: string;
}

interface Prediction {
  apiKey?: string;
  error?: string;
  output?: unknown;
  readWith: (string | undefined)[];
  status: string;
}

interface Ingredient {
  category: string;
  error?: string;
  mediaUrl?: string;
  organizationId: string;
  predictionId?: string;
}

interface ProviderAction {
  error?: string;
  identity: { continuationId: string; organizationId: string };
  provider: string;
  providerResult: { externalId: string };
}

interface Settlement extends ProviderAction {
  outcome: 'completed' | 'failed';
}

const RESULT_URL = 'https://replicate.delivery/pbxt/result.mp4';

const candidate = (id: string, fields: Partial<Candidate> = {}): Candidate => ({
  continuationId: `continuation-${id}`,
  externalId: `prediction-${id}`,
  ingredientId: `ingredient-${id}`,
  organizationId: 'org-1',
  ...fields,
});

describe('WorkflowContinuationReconcileService', () => {
  let byokKeys: Map<string, string>;
  let isByokDown: boolean;
  let candidates: Candidate[];
  let predictions: Map<string, Prediction>;
  let ingredients: Map<string, Ingredient>;
  let settlements: Settlement[];
  let outboxPasses: number;
  let loggedErrors: Record<string, unknown>[];
  let service: WorkflowContinuationReconcileService;

  const predict = (id: string, fields: Partial<Prediction>) =>
    predictions.set(`prediction-${id}`, {
      readWith: [],
      status: '',
      ...fields,
    });

  beforeEach(() => {
    byokKeys = new Map([['org-1', 'org-replicate-key']]);
    isByokDown = false;
    candidates = [];
    predictions = new Map();
    ingredients = new Map();
    settlements = [];
    outboxPasses = 0;
    loggedErrors = [];

    const byok = {
      lookupApiKey: async (organizationId: string, provider: ByokProvider) => {
        if (isByokDown) {
          throw new Error('database unavailable');
        }
        const apiKey =
          provider === ByokProvider.REPLICATE
            ? byokKeys.get(organizationId)
            : undefined;
        return apiKey ? { apiKey } : undefined;
      },
    } as unknown as ByokService;
    const continuations = {
      findReplicatePollCandidates: async () => candidates,
    } as unknown as WorkflowNodeContinuationService;
    const coordinator = {
      completeProviderAction: async (action: ProviderAction) => {
        settlements.push({ ...action, outcome: 'completed' });
      },
      failProviderAction: async (action: ProviderAction) => {
        settlements.push({ ...action, outcome: 'failed' });
      },
      reconcileProviderContinuations: async () => {
        outboxPasses += 1;
        return { failed: 0, pollsDispatched: 0, resumed: 0 };
      },
    } as unknown as WorkflowNodeContinuationCoordinatorService;
    const ingredientsService = {
      findOneSelect: async (where: { id: string; organizationId: string }) => {
        const row = ingredients.get(where.id);
        return row?.organizationId === where.organizationId
          ? { category: row.category }
          : null;
      },
    } as unknown as IngredientsService;
    // Replicate: a prediction is readable only with the key that created it.
    const replicate = {
      getPrediction: async (id: string, apiKey?: string) => {
        const prediction = predictions.get(id);
        if (!prediction || prediction.apiKey !== apiKey) {
          throw new Error(`401 for ${id}`);
        }
        prediction.readWith.push(apiKey);
        return {
          error: prediction.error,
          output: prediction.output,
          status: prediction.status,
        };
      },
    } as unknown as ReplicateService;
    const webhooks = {
      handleFailedGenerationForIngredient: async (
        id: string,
        error: string,
      ) => {
        Object.assign(ingredients.get(id) ?? {}, { error });
      },
      processMediaForIngredient: async (
        id: string,
        _category: string,
        mediaUrl: string,
        predictionId: string,
      ) => {
        Object.assign(ingredients.get(id) ?? {}, { mediaUrl, predictionId });
      },
    } as unknown as WebhooksService;
    const logger = {
      error: (message: string, _error: unknown, context: object) => {
        loggedErrors.push({ message, ...context });
      },
    } as unknown as LoggerService;

    service = new WorkflowContinuationReconcileService(
      continuations,
      coordinator,
      ingredientsService,
      replicate,
      webhooks,
      logger,
      byok,
    );
  });

  it('stores a succeeded prediction on its ingredient and completes the continuation', async () => {
    candidates.push(candidate('1'));
    predict('1', { output: RESULT_URL, status: 'succeeded' });
    ingredients.set('ingredient-1', {
      category: 'VIDEO',
      organizationId: 'org-1',
    });

    await service.reconcile();

    expect(ingredients.get('ingredient-1')).toEqual({
      category: 'VIDEO',
      mediaUrl: RESULT_URL,
      organizationId: 'org-1',
      predictionId: 'prediction-1',
    });
    expect(settlements).toEqual([
      {
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        outcome: 'completed',
        provider: 'replicate',
        providerResult: { externalId: 'prediction-1' },
      },
    ]);
    expect(outboxPasses).toBe(2);
  });

  it.each([
    ['a BYOK prediction with the organization key', true, 'org-replicate-key'],
    ['a platform prediction with the platform key', false, undefined],
  ])('reads %s', async (_case, isByok, apiKey) => {
    candidates.push(candidate('1', { isByok }));
    predict('1', { apiKey, status: 'processing' });

    await service.reconcile();

    expect(predictions.get('prediction-1')?.readWith).toEqual([apiKey]);
    expect(settlements).toEqual([]);
  });

  it('fails a BYOK continuation instead of polling with the platform key once the org key is gone', async () => {
    byokKeys.clear();
    candidates.push(candidate('1', { isByok: true }));
    predict('1', { status: 'processing' });
    ingredients.set('ingredient-1', {
      category: 'VIDEO',
      organizationId: 'org-1',
    });

    await service.reconcile();

    expect(predictions.get('prediction-1')?.readWith).toEqual([]);
    const error =
      'The Replicate key that started this generation is no longer available';
    expect(ingredients.get('ingredient-1')?.error).toBe(error);
    expect(settlements).toEqual([
      {
        error,
        identity: { continuationId: 'continuation-1', organizationId: 'org-1' },
        outcome: 'failed',
        provider: 'replicate',
        providerResult: { externalId: 'prediction-1' },
      },
    ]);
  });

  it('leaves a BYOK continuation for a later run when the key lookup errors', async () => {
    isByokDown = true;
    candidates.push(candidate('1', { isByok: true }));
    predict('1', { apiKey: 'org-replicate-key', status: 'succeeded' });
    ingredients.set('ingredient-1', {
      category: 'VIDEO',
      organizationId: 'org-1',
    });

    await service.reconcile();

    expect(predictions.get('prediction-1')?.readWith).toEqual([]);
    expect(ingredients.get('ingredient-1')).toEqual({
      category: 'VIDEO',
      organizationId: 'org-1',
    });
    expect(settlements).toEqual([]);
    expect(loggedErrors).toEqual([
      expect.objectContaining({ continuationId: 'continuation-1' }),
    ]);
  });

  it.each([
    [
      'its provider error',
      { error: 'NSFW content detected', status: 'failed' },
      'NSFW content detected',
    ],
    [
      'its end status',
      { status: 'canceled' },
      'Replicate prediction prediction-1 ended with status canceled',
    ],
    [
      'a succeeded status without an allowed output URL',
      { output: ['https://evil.example/x.mp4'], status: 'succeeded' },
      'Replicate prediction prediction-1 ended with status succeeded',
    ],
  ])('fails an ended prediction with %s', async (_case, fields, error) => {
    candidates.push(candidate('1'));
    predict('1', fields);
    ingredients.set('ingredient-1', {
      category: 'IMAGE',
      organizationId: 'org-1',
    });

    await service.reconcile();

    expect(ingredients.get('ingredient-1')).toEqual({
      category: 'IMAGE',
      error,
      organizationId: 'org-1',
    });
    expect(settlements).toEqual([
      expect.objectContaining({ error, outcome: 'failed' }),
    ]);
  });

  it('fails a continuation whose ingredient belongs to another organization', async () => {
    candidates.push(candidate('1'));
    predict('1', { output: RESULT_URL, status: 'succeeded' });
    ingredients.set('ingredient-1', {
      category: 'VIDEO',
      organizationId: 'org-2',
    });

    await service.reconcile();

    expect(ingredients.get('ingredient-1')).toEqual({
      category: 'VIDEO',
      organizationId: 'org-2',
    });
    expect(settlements).toEqual([
      expect.objectContaining({
        error: 'Continuation ingredient ingredient-1 not found',
        outcome: 'failed',
      }),
    ]);
  });

  it('isolates a poison prediction and still settles later candidates', async () => {
    candidates.push(candidate('poison'), candidate('healthy'));
    predict('healthy', { output: [RESULT_URL], status: 'succeeded' });
    ingredients.set('ingredient-healthy', {
      category: 'VIDEO',
      organizationId: 'org-1',
    });

    await service.reconcile();

    expect(ingredients.get('ingredient-healthy')?.mediaUrl).toBe(RESULT_URL);
    expect(settlements).toEqual([
      expect.objectContaining({
        identity: {
          continuationId: 'continuation-healthy',
          organizationId: 'org-1',
        },
        outcome: 'completed',
      }),
    ]);
    expect(loggedErrors).toEqual([
      {
        continuationId: 'continuation-poison',
        message:
          'WorkflowContinuationReconcileService failed to reconcile Replicate continuation',
        organizationId: 'org-1',
      },
    ]);
  });
});
