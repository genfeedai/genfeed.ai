import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { FalService } from '@api/services/integrations/fal/services/fal.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Ingredient {
  category: IngredientCategory;
  generationBilling?: Record<string, unknown>;
  generationError?: string;
  id: string;
  isDeleted: boolean;
  isGenerationFailureConfirmed?: boolean;
  metadata?: Record<string, unknown>;
  organizationId: string;
  status: IngredientStatus;
  workflowExecutionId?: string;
}

interface ExecutionWhere {
  isDeleted: boolean;
  organizationId: string;
  status: IngredientStatus;
  workflowExecutionId: string;
}

interface IngredientWhere {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status?: IngredientStatus;
}

const QUOTE_GROUP = {
  kind: 'quote-group',
  outputIndex: 0,
  reservationId: 'hold-1',
};

// The cancellation detaches from the abort listener; let it finish.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('IngredientGenerationCancellationService', () => {
  let rows: Map<string, Ingredient>;
  let predictions: Map<string, string>;
  let isReplicateDown: boolean;
  let falCancels: Array<{ endpoint: string; requestId: string }>;
  let isFalCancelAccepted: boolean;
  let completesDuringCancel: string | undefined;
  let unreadableIds: Set<string>;
  let notifications: Record<string, unknown>[];
  let warnings: string[];
  let service: IngredientGenerationCancellationService;

  const processing = (id: string, fields: Partial<Ingredient> = {}) => {
    rows.set(id, {
      category: IngredientCategory.IMAGE,
      id,
      isDeleted: false,
      metadata: { externalId: 'pred-1', externalProvider: 'replicate' },
      organizationId: 'org-1',
      status: IngredientStatus.PROCESSING,
      ...fields,
    });
    predictions.set('pred-1', 'processing');
  };
  const cancel = (id = 'ing-1', organizationId = 'org-1') =>
    service.cancelProcessingIngredient({
      id,
      organizationId,
      userId: 'user-1',
    });

  beforeEach(() => {
    rows = new Map();
    predictions = new Map();
    isReplicateDown = false;
    falCancels = [];
    isFalCancelAccepted = true;
    completesDuringCancel = undefined;
    unreadableIds = new Set();
    notifications = [];
    warnings = [];

    const matches = (row: Ingredient, where: IngredientWhere) =>
      row.id === where.id &&
      row.organizationId === where.organizationId &&
      row.isDeleted === where.isDeleted &&
      (where.status === undefined || row.status === where.status);
    const prisma = {
      ingredient: {
        findMany: async ({ where }: { where: ExecutionWhere }) =>
          [...rows.values()]
            .filter(
              (row) =>
                row.workflowExecutionId === where.workflowExecutionId &&
                row.organizationId === where.organizationId &&
                row.isDeleted === where.isDeleted &&
                row.status === where.status,
            )
            .map((row) => ({ id: row.id })),
      },
      $transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({
          creditReservation: { findFirst: async () => null },
          ingredient: {
            findFirst: async ({ where }: { where: IngredientWhere }) =>
              [...rows.values()].find((row) => matches(row, where)) ?? null,
          },
        }),
    };
    const ingredientsService = {
      findOne: async (where: IngredientWhere) => {
        if (unreadableIds.has(where.id)) throw new Error('database down');
        const row = [...rows.values()].find((r) => matches(r, where));
        return row ? { ...row } : null;
      },
      patchAll: async (where: IngredientWhere, data: Partial<Ingredient>) => {
        const claimed = [...rows.values()].filter((r) => matches(r, where));
        for (const row of claimed) {
          Object.assign(row, data);
        }
        return { modifiedCount: claimed.length };
      },
      prisma,
    } as unknown as IngredientsService;
    // Replicate: a cancel stops the prediction unless the provider is down.
    const replicate = {
      cancelPrediction: async (id: string) => {
        if (isReplicateDown) {
          throw new Error('network unavailable');
        }
        if (completesDuringCancel) {
          Object.assign(rows.get(completesDuringCancel) ?? {}, {
            status: IngredientStatus.GENERATED,
          });
          return;
        }
        if (predictions.get(id) === 'processing') {
          predictions.set(id, 'canceled');
        }
      },
      getPrediction: async (id: string) => ({ status: predictions.get(id) }),
    } as unknown as ReplicateService;
    // fal: confirms a cancel only while it accepts one.
    const fal = {
      cancelRequest: async (ref: { endpoint: string; requestId: string }) => {
        falCancels.push(ref);
        return isFalCancelAccepted;
      },
    } as unknown as FalService;
    const failedGeneration = {
      notifyFailedGeneration: async (payload: Record<string, unknown>) => {
        notifications.push(payload);
      },
    } as unknown as FailedGenerationService;
    const logger = {
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService;

    service = new IngredientGenerationCancellationService(
      failedGeneration,
      fal,
      ingredientsService,
      logger,
      replicate,
    );
  });

  it.each([
    ['an unknown ingredient', 'ing-missing', 'org-1'],
    ['another organization ingredient', 'ing-1', 'org-2'],
  ])('refuses %s', async (_case, id, organizationId) => {
    processing('ing-1');

    await expect(cancel(id, organizationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rows.get('ing-1')?.status).toBe(IngredientStatus.PROCESSING);
  });

  it('leaves a finished ingredient and its prediction alone', async () => {
    processing('ing-1', { status: IngredientStatus.GENERATED });

    await expect(cancel()).resolves.toMatchObject({
      status: IngredientStatus.GENERATED,
    });
    expect(predictions.get('pred-1')).toBe('processing');
    expect(notifications).toEqual([]);
  });

  it.each([
    [IngredientCategory.IMAGE, '/images/ing-1'],
    [IngredientCategory.VIDEO, '/videos/ing-1'],
    [IngredientCategory.MUSIC, '/musics/ing-1'],
  ])(
    'cancels a batch %s prediction, fails the placeholder and tells its page',
    async (category, websocketUrl) => {
      processing('ing-1', {
        category,
        metadata: { externalId: 'pred-1_0', externalProvider: 'replicate' },
      });

      await expect(cancel()).resolves.toMatchObject({
        generationError: GENERATION_CANCELLED_BY_USER,
        status: IngredientStatus.FAILED,
      });
      expect(predictions.get('pred-1')).toBe('canceled');
      expect(notifications).toEqual([
        {
          ingredientId: 'ing-1',
          organizationId: 'org-1',
          userId: 'user-1',
          websocketMessage: GENERATION_CANCELLED_BY_USER,
          websocketMethod: 'publishMediaFailed',
          websocketUrl,
        },
      ]);
    },
  );

  it('still fails an unfunded placeholder when the provider cancel call fails', async () => {
    processing('ing-1');
    isReplicateDown = true;

    await expect(cancel()).resolves.toMatchObject({
      status: IngredientStatus.FAILED,
    });
    expect(notifications).toHaveLength(1);
    expect(warnings).toEqual([
      'Provider cancellation is unconfirmed; retain funded generation for completion',
    ]);
  });

  it('fails a funded output once the provider confirms the cancel', async () => {
    processing('ing-1', { generationBilling: QUOTE_GROUP });

    await expect(cancel()).resolves.toMatchObject({
      generationError: GENERATION_CANCELLED_BY_USER,
      isGenerationFailureConfirmed: true,
      status: IngredientStatus.FAILED,
    });
    expect(notifications).toHaveLength(1);
  });

  it.each([
    ['the provider is unreachable', true, 'processing'],
    ['the provider reports the prediction succeeded', false, 'succeeded'],
  ])(
    'keeps a funded output processing for late completion when %s',
    async (_case, isDown, providerStatus) => {
      processing('ing-1', { generationBilling: QUOTE_GROUP });
      isReplicateDown = isDown;
      predictions.set('pred-1', providerStatus);

      await expect(cancel()).resolves.toMatchObject({
        status: IngredientStatus.PROCESSING,
      });
      expect(rows.get('ing-1')).toMatchObject({
        status: IngredientStatus.PROCESSING,
      });
      expect(notifications).toEqual([]);
    },
  );

  it('keeps a completed output when completion wins during the provider cancel', async () => {
    processing('ing-1');
    completesDuringCancel = 'ing-1';

    await expect(cancel()).resolves.toMatchObject({
      status: IngredientStatus.GENERATED,
    });
    expect(rows.get('ing-1')).not.toHaveProperty('generationError');
    expect(notifications).toEqual([]);
  });

  it('tells the page once when two cancels race for the same output', async () => {
    processing('ing-1');

    await Promise.all([cancel(), cancel()]);

    expect(rows.get('ing-1')?.status).toBe(IngredientStatus.FAILED);
    expect(notifications).toHaveLength(1);
  });

  it('cancels a live generation as soon as its signal aborts', async () => {
    processing('ing-1');
    const abort = new AbortController();

    service.bindCancelOnAbort({
      abortSignal: abort.signal,
      id: 'ing-1',
      organizationId: 'org-1',
    });
    await settle();
    expect(rows.get('ing-1')?.status).toBe(IngredientStatus.PROCESSING);

    abort.abort();
    await settle();

    expect(rows.get('ing-1')?.status).toBe(IngredientStatus.FAILED);
    expect(predictions.get('pred-1')).toBe('canceled');
  });

  it('cancels at once when the signal has already aborted', async () => {
    processing('ing-1');
    const abort = new AbortController();
    abort.abort();

    service.bindCancelOnAbort({
      abortSignal: abort.signal,
      id: 'ing-1',
      organizationId: 'org-1',
    });
    await settle();

    expect(rows.get('ing-1')?.status).toBe(IngredientStatus.FAILED);
  });
  describe('a generation running on fal', () => {
    const FAL_REF = 'fal-request:fal-ai/flux/dev:req-123';
    const onFal = (fields: Partial<Ingredient> = {}) =>
      processing('ing-1', {
        metadata: { externalId: FAL_REF, externalProvider: 'fal' },
        ...fields,
      });

    it('asks fal to cancel the request and fails the placeholder', async () => {
      onFal();

      await expect(cancel()).resolves.toMatchObject({
        generationError: GENERATION_CANCELLED_BY_USER,
        status: IngredientStatus.FAILED,
      });
      expect(falCancels).toEqual([
        { endpoint: 'fal-ai/flux/dev', requestId: 'req-123' },
      ]);
      expect(notifications).toHaveLength(1);
    });

    it('fails a funded output once fal accepts the cancel', async () => {
      onFal({ generationBilling: QUOTE_GROUP });

      await expect(cancel()).resolves.toMatchObject({
        isGenerationFailureConfirmed: true,
        status: IngredientStatus.FAILED,
      });
    });

    it('keeps a funded output processing when fal does not confirm the cancel', async () => {
      onFal({ generationBilling: QUOTE_GROUP });
      isFalCancelAccepted = false;

      await expect(cancel()).resolves.toMatchObject({
        status: IngredientStatus.PROCESSING,
      });
      expect(notifications).toEqual([]);
      expect(warnings).toContain(
        'fal did not confirm the cancel; the job may still run at the provider',
      );
    });

    it('says so, and still fails an unfunded placeholder, when fal does not confirm', async () => {
      onFal();
      isFalCancelAccepted = false;

      await expect(cancel()).resolves.toMatchObject({
        status: IngredientStatus.FAILED,
      });
      expect(warnings).toContain(
        'fal did not confirm the cancel; the job may still run at the provider',
      );
    });

    it('sends no cancel once the job has finished and holds its output URL', async () => {
      onFal({
        metadata: {
          externalId: 'https://v3.fal.media/files/out.png',
          externalProvider: 'fal',
        },
      });

      await cancel();

      expect(falCancels).toEqual([]);
      expect(warnings).toContain(
        'Provider has no cancel call here; the job keeps running at the provider',
      );
    });
  });
  describe('stopping an agent run', () => {
    const stop = () =>
      service.cancelProcessingForExecution({
        executionId: 'run-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });
    const inRun = (id: string, fields: Partial<Ingredient> = {}) =>
      processing(id, { workflowExecutionId: 'run-1', ...fields });

    it('cancels only the processing generations of that run, at the provider', async () => {
      inRun('ing-1', {
        metadata: { externalId: 'pred-a', externalProvider: 'replicate' },
      });
      inRun('ing-2', {
        metadata: {
          externalId: 'fal-request:fal-ai/flux/dev:req-9',
          externalProvider: 'fal',
        },
      });
      inRun('ing-done', { status: IngredientStatus.GENERATED });
      processing('ing-other-run', { workflowExecutionId: 'run-2' });
      inRun('ing-other-org', { organizationId: 'org-2' });
      predictions.set('pred-a', 'processing');

      await expect(stop()).resolves.toBe(2);

      expect(rows.get('ing-1')?.status).toBe(IngredientStatus.FAILED);
      expect(rows.get('ing-2')?.status).toBe(IngredientStatus.FAILED);
      expect(predictions.get('pred-a')).toBe('canceled');
      expect(falCancels).toEqual([
        { endpoint: 'fal-ai/flux/dev', requestId: 'req-9' },
      ]);
      expect(rows.get('ing-done')?.status).toBe(IngredientStatus.GENERATED);
      expect(rows.get('ing-other-run')?.status).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(rows.get('ing-other-org')?.status).toBe(
        IngredientStatus.PROCESSING,
      );
    });

    it('keeps cancelling the rest when one generation cannot be read', async () => {
      inRun('ing-1');
      inRun('ing-2');
      unreadableIds.add('ing-1');

      await expect(stop()).resolves.toBe(1);

      expect(rows.get('ing-1')?.status).toBe(IngredientStatus.PROCESSING);
      expect(rows.get('ing-2')?.status).toBe(IngredientStatus.FAILED);
      expect(warnings).toEqual([
        'Stopping a run could not cancel one of its generations',
      ]);
    });

    it('keeps a funded generation running when the provider does not confirm', async () => {
      inRun('ing-1', {
        generationBilling: QUOTE_GROUP,
        metadata: {
          externalId: 'fal-request:fal-ai/flux/dev:req-9',
          externalProvider: 'fal',
        },
      });
      isFalCancelAccepted = false;

      await expect(stop()).resolves.toBe(0);

      expect(rows.get('ing-1')?.status).toBe(IngredientStatus.PROCESSING);
    });
  });
});
