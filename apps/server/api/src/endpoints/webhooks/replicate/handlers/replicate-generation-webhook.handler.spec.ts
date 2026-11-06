import type { AssetsService } from '@api/collections/assets/services/assets.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import type { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface ManifestWhere {
  externalId: { startsWith: string };
  externalProvider: string;
  ingredients: { some: { organizationId: string } };
  isDeleted: boolean;
}

const ALLOWED_URL = 'https://replicate.delivery/pbxt/abc/out-0.png';
const SECOND_URL = 'https://replicate.delivery/pbxt/abc/out-1.png';
const FOREIGN_URL = 'https://evil.example.com/out-0.png';
const PREDICTION = 'pred_123';

const byFields = (where: Row) => (row: Row) =>
  Object.entries(where).every(([key, value]) =>
    key === 'isDeleted' ? Boolean(row.isDeleted) === value : row[key] === value,
  );

const succeeded = (
  output: unknown,
  id: string = PREDICTION,
): ReplicateWebhookPayload => ({
  id,
  model: 'owner/some-model',
  output,
  status: 'succeeded',
});

const failed = (status: string, error?: string): ReplicateWebhookPayload => ({
  error,
  id: PREDICTION,
  model: 'owner/some-model',
  status,
});

describe('ReplicateGenerationWebhookHandler', () => {
  // The rows a Replicate callback resolves against.
  let assets: Row[];
  let metadata: Row[];
  let ingredients: Row[];
  let models: Row[];
  let continuationTargets: Row[];
  // What the callback did about them.
  let assetUploads: [string, string][];
  let finalizedOutputs: [string, string, string][];
  let finalizedIngredients: [string, string, string, string][];
  let failedOutputs: [string, string][];
  let failedIngredients: [string, string][];
  let continuations: Row[];
  let assetStatuses: Row[];
  let errors: string[];
  let warnings: string[];
  let handler: ReplicateGenerationWebhookHandler;

  const table = (rows: () => Row[]) => ({
    findOne: async (where: Row) => {
      const found = rows().find(byFields(where));
      return found ? { ...found } : null;
    },
    findOneSelect: async (where: Row) => {
      const found = rows().find(byFields(where));
      return found ? { ...found } : null;
    },
    patch: async (id: string, data: Row) => {
      const found = rows().find((row) => row.id === id);
      if (!found) throw new Error(`Row ${id} not found`);
      return Object.assign(found, data);
    },
  });

  beforeEach(() => {
    assets = [];
    metadata = [];
    ingredients = [];
    models = [{ category: ModelCategory.IMAGE, key: 'owner/some-model' }];
    continuationTargets = [];
    assetUploads = [];
    finalizedOutputs = [];
    finalizedIngredients = [];
    failedOutputs = [];
    failedIngredients = [];
    continuations = [];
    assetStatuses = [];
    errors = [];
    warnings = [];

    const metadataTable = {
      ...table(() => metadata),
      // The native-dispatch manifest: indexed rows of one prediction that an
      // ingredient of the organization owns, deleted or not.
      findAll: async ({ where }: { where: ManifestWhere }) => ({
        docs: metadata.filter(
          (row) =>
            String(row.externalId).startsWith(where.externalId.startsWith) &&
            row.externalProvider === where.externalProvider &&
            Boolean(row.isDeleted) === where.isDeleted &&
            ingredients.some(
              (ingredient) =>
                ingredient.metadataId === row.id &&
                ingredient.organizationId ===
                  where.ingredients.some.organizationId,
            ),
        ),
      }),
    };

    handler = new ReplicateGenerationWebhookHandler(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      table(() => ingredients) as unknown as IngredientsService,
      metadataTable as unknown as MetadataService,
      table(() => models) as unknown as ModelsService,
      table(() => assets) as unknown as AssetsService,
      {
        handleFailedGeneration: async (externalId: string, error: string) => {
          failedOutputs.push([externalId, error]);
        },
        handleFailedGenerationForIngredient: async (
          ingredientId: string,
          error: string,
        ) => {
          failedIngredients.push([ingredientId, error]);
        },
        processAssetFromWebhook: async (
          _provider: string,
          assetId: string,
          url: string,
        ) => {
          assetUploads.push([assetId, url]);
        },
        processMediaForIngredient: async (
          ingredientId: string,
          category: string,
          url: string,
          externalId: string,
        ) => {
          finalizedIngredients.push([ingredientId, category, url, externalId]);
        },
        processMediaFromWebhook: async (
          _provider: string,
          category: string,
          externalId: string,
          url: string,
        ) => {
          finalizedOutputs.push([externalId, category, url]);
        },
      } as unknown as WebhooksService,
      {
        publishAssetStatus: async (
          assetId: string,
          status: string,
          userId: string,
          details: Row,
        ) => {
          assetStatuses.push({ assetId, details, status, userId });
        },
      } as unknown as NotificationsPublisherService,
      {
        completeProviderAction: async (action: Row) => {
          continuations.push({ ...action, outcome: 'completed' });
        },
        failProviderAction: async (action: Row) => {
          continuations.push({ ...action, outcome: 'failed' });
        },
      } as unknown as WorkflowNodeContinuationCoordinatorService,
      {
        findCallbackTarget: async ({
          continuationId,
        }: {
          continuationId: string;
        }) =>
          continuationTargets.find(
            (target) => target.continuationId === continuationId,
          ) ?? null,
      } as unknown as WorkflowNodeContinuationService,
    );
  });

  const metadataRow = (id: string) => metadata.find((row) => row.id === id);

  // A single-output generation dispatched under the bare prediction id.
  const seedSingle = (
    category: IngredientCategory = IngredientCategory.IMAGE,
    externalId: string = PREDICTION,
  ) => {
    metadata.push({
      externalId,
      externalProvider: 'replicate',
      id: 'metadata-1',
    });
    ingredients.push({
      category,
      id: 'ingredient-1',
      metadataId: 'metadata-1',
      organizationId: 'org-1',
    });
  };

  // A workflow step waiting on the prediction.
  const seedContinuation = (fields: Row = {}) => {
    metadata.push({ id: 'metadata-1' });
    ingredients.push({
      category: IngredientCategory.MUSIC,
      id: 'ingredient-1',
      metadataId: 'metadata-1',
      organizationId: 'org-1',
    });
    continuationTargets.push({
      continuationId: 'continuation-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
      ...fields,
    });
  };

  // A native batch of two indexed outputs, optionally with one slot deleted.
  const seedBatch = (
    deletedIndex?: number,
    owner: Row = { organizationId: 'org-1' },
  ) => {
    metadata.push(
      ...[0, 1].map((index) => ({
        externalId: `${PREDICTION}_${index}`,
        externalProvider: 'replicate',
        id: `metadata-${index}`,
        isDeleted: index === deletedIndex,
      })),
    );
    ingredients.push(
      ...[0, 1].map((index) => ({
        category: IngredientCategory.IMAGE,
        id: `ingredient-${index}`,
        isDeleted: index === deletedIndex,
        metadataId: `metadata-${index}`,
        ...owner,
      })),
    );
  };

  describe('single-output generations', () => {
    it('finalizes an output served by Replicate', async () => {
      seedSingle();

      await handler.handleCompleted(succeeded(ALLOWED_URL));

      expect(finalizedOutputs).toEqual([
        [PREDICTION, IngredientCategory.IMAGE, ALLOWED_URL],
      ]);
    });

    it('refuses to fetch an output on a foreign host', async () => {
      seedSingle();

      await handler.handleCompleted(succeeded([FOREIGN_URL]));

      expect(finalizedOutputs).toEqual([]);
      expect(errors).toEqual([
        'Replicate webhook: output URL rejected by host allowlist',
      ]);
      expect(warnings).toEqual([
        'Replicate webhook: output array contained no URLs',
      ]);
    });

    it.each([
      ['several outputs', [FOREIGN_URL, ALLOWED_URL]],
      ['duplicated outputs', [ALLOWED_URL, ALLOWED_URL]],
      ['a non-string entry', [ALLOWED_URL, { url: ALLOWED_URL }]],
      ['an object', { images: [ALLOWED_URL] }],
      ['no outputs', []],
    ])(
      'keeps %s on the metadata for recovery instead of picking one',
      async (_case, output) => {
        seedSingle();

        await expect(
          handler.handleCompleted(succeeded(output)),
        ).rejects.toThrow('Replicate single-output dispatch requires recovery');

        expect(metadataRow('metadata-1')).toMatchObject({
          error:
            'Provider output does not match the single-output dispatch manifest; recovery is required',
          result: JSON.stringify(output),
        });
        expect(finalizedOutputs).toEqual([]);
        expect(failedOutputs).toEqual([]);
      },
    );

    it.each([
      ['its recorded ingredient', PREDICTION, PREDICTION],
      ['the base prediction of an indexed callback', 'pred123', 'pred123_0'],
    ])(
      'classifies by %s, not the model registry',
      async (_case, recordedId, callbackId) => {
        seedSingle(IngredientCategory.MUSIC, recordedId);

        await handler.handleCompleted(succeeded(ALLOWED_URL, callbackId));

        expect(finalizedOutputs).toEqual([
          [callbackId, IngredientCategory.MUSIC, ALLOWED_URL],
        ]);
      },
    );

    it.each([
      ['a video model', ModelCategory.VIDEO, IngredientCategory.VIDEO],
      ['a music model', ModelCategory.MUSIC, IngredientCategory.MUSIC],
      ['an image model', ModelCategory.IMAGE, IngredientCategory.IMAGE],
    ])(
      'falls back to %s in the registry when no ingredient is recorded',
      async (_case, modelCategory, ingredientCategory) => {
        models = [{ category: modelCategory, key: 'owner/some-model' }];

        await handler.handleCompleted(succeeded(ALLOWED_URL));

        expect(finalizedOutputs).toEqual([
          [PREDICTION, ingredientCategory, ALLOWED_URL],
        ]);
      },
    );

    it('defaults to an image when the model is not registered either', async () => {
      models = [];

      await handler.handleCompleted(succeeded(ALLOWED_URL));

      expect(finalizedOutputs).toEqual([
        [PREDICTION, IngredientCategory.IMAGE, ALLOWED_URL],
      ]);
      expect(warnings).toEqual([
        'Model not found in database, defaulting to IMAGE category',
      ]);
    });
  });

  describe('workflow continuations', () => {
    it.each([
      ['before the provider id is recorded', {}],
      ['when it owns the continuation', { externalId: PREDICTION }],
    ])(
      'finalizes the target ingredient by continuation identity %s',
      async (_case, fields) => {
        seedContinuation(fields);

        await handler.handleCompleted(succeeded(ALLOWED_URL), 'continuation-1');

        expect(finalizedIngredients).toEqual([
          ['ingredient-1', IngredientCategory.MUSIC, ALLOWED_URL, PREDICTION],
        ]);
        expect(finalizedOutputs).toEqual([]);
        expect(continuations).toEqual([
          {
            identity: {
              continuationId: 'continuation-1',
              organizationId: 'org-1',
            },
            outcome: 'completed',
            provider: 'replicate',
            providerResult: { externalId: PREDICTION },
          },
        ]);
      },
    );

    it('defaults the category to an image when the target ingredient is gone', async () => {
      continuationTargets.push({
        continuationId: 'continuation-1',
        ingredientId: 'ingredient-missing',
        organizationId: 'org-1',
      });

      await handler.handleCompleted(succeeded(ALLOWED_URL), 'continuation-1');

      expect(finalizedIngredients).toEqual([
        [
          'ingredient-missing',
          IngredientCategory.IMAGE,
          ALLOWED_URL,
          PREDICTION,
        ],
      ]);
    });

    it('keeps several outputs for recovery instead of completing the step from one', async () => {
      seedContinuation();
      const returned = [ALLOWED_URL, SECOND_URL];

      await expect(
        handler.handleCompleted(succeeded(returned), 'continuation-1'),
      ).rejects.toThrow('requires recovery');

      expect(metadataRow('metadata-1')).toMatchObject({
        result: JSON.stringify(returned),
      });
      expect(finalizedIngredients).toEqual([]);
      expect(continuations).toEqual([]);
    });

    it.each([
      ['handleCompleted', succeeded(ALLOWED_URL)],
      ['handleFailed', failed('failed', 'NSFW content')],
    ] as const)(
      '%s refuses a callback whose prediction does not own the continuation',
      async (method, payload) => {
        seedContinuation({ externalId: 'pred_other' });

        await expect(
          handler[method](payload, 'continuation-1'),
        ).rejects.toThrow(
          'Replicate callback pred_123 does not own continuation continuation-1',
        );

        expect(finalizedIngredients).toEqual([]);
        expect(failedIngredients).toEqual([]);
        expect(continuations).toEqual([]);
      },
    );

    it.each([
      ['handleCompleted', succeeded(ALLOWED_URL)],
      ['handleFailed', failed('failed')],
    ] as const)(
      '%s refuses a continuation that does not exist',
      async (method, payload) => {
        await expect(
          handler[method](payload, 'continuation-1'),
        ).rejects.toThrow(
          'Replicate workflow continuation continuation-1 not found',
        );
      },
    );

    it.each([
      ['the provider error', 'NSFW content', 'NSFW content'],
      ['a generic error without one', undefined, 'Replicate generation failed'],
    ])(
      'fails the ingredient and the step with %s',
      async (_case, error, recorded) => {
        seedContinuation();

        await handler.handleFailed(failed('failed', error), 'continuation-1');

        expect(failedIngredients).toEqual([['ingredient-1', recorded]]);
        expect(continuations).toEqual([
          {
            error: recorded,
            identity: {
              continuationId: 'continuation-1',
              organizationId: 'org-1',
            },
            outcome: 'failed',
            provider: 'replicate',
            providerResult: { externalId: PREDICTION },
          },
        ]);
        expect(failedOutputs).toEqual([]);
      },
    );
  });

  describe('native batch manifests', () => {
    it.each([
      ['a bare string', ALLOWED_URL],
      ['a one-entry array', [ALLOWED_URL]],
    ])(
      'finalizes index zero and closes the unproduced slot when the provider returned %s',
      async (_case, output) => {
        seedBatch();

        await handler.handleCompleted(succeeded(output));

        expect(finalizedOutputs).toEqual([
          [`${PREDICTION}_0`, IngredientCategory.IMAGE, ALLOWED_URL],
        ]);
        expect(failedOutputs).toEqual([
          [
            `${PREDICTION}_1`,
            'Provider completed without producing this requested output',
          ],
        ]);
      },
    );

    it('finalizes every produced slot', async () => {
      seedBatch();

      await handler.handleCompleted(succeeded([ALLOWED_URL, SECOND_URL]));

      expect(finalizedOutputs).toEqual([
        [`${PREDICTION}_0`, IngredientCategory.IMAGE, ALLOWED_URL],
        [`${PREDICTION}_1`, IngredientCategory.IMAGE, SECOND_URL],
      ]);
      expect(failedOutputs).toEqual([]);
    });

    it.each([
      [0, `${PREDICTION}_1`, SECOND_URL],
      [1, `${PREDICTION}_0`, ALLOWED_URL],
    ])(
      'keeps deleted slot %s in the funded manifest and finalizes only the survivor',
      async (deletedIndex, survivor, url) => {
        seedBatch(deletedIndex);

        await handler.handleCompleted(succeeded([ALLOWED_URL, SECOND_URL]));

        expect(finalizedOutputs).toEqual([
          [survivor, IngredientCategory.IMAGE, url],
        ]);
        expect(failedOutputs).toEqual([]);
      },
    );

    it('keeps every output for recovery when the provider returned more than were funded', async () => {
      seedBatch();
      const returned = [ALLOWED_URL, SECOND_URL, ALLOWED_URL];

      await expect(
        handler.handleCompleted(succeeded(returned)),
      ).rejects.toThrow(
        'Replicate output cardinality exceeds the funded dispatch manifest',
      );

      expect(metadataRow('metadata-0')).toMatchObject({
        error:
          'Provider returned more outputs than the funded dispatch manifest; recovery is required',
        result: JSON.stringify(returned),
      });
      expect(finalizedOutputs).toEqual([]);
      expect(failedOutputs).toEqual([]);
    });

    it.each([
      ['an object', { images: [ALLOWED_URL] }],
      ['object entries', [{ url: ALLOWED_URL }]],
      ['nested arrays', [[ALLOWED_URL]]],
    ])(
      'keeps %s for recovery as an unsupported representation',
      async (_case, returned) => {
        seedBatch();

        await expect(
          handler.handleCompleted(succeeded(returned)),
        ).rejects.toThrow('Replicate output representation requires recovery');

        expect(metadataRow('metadata-0')).toMatchObject({
          error:
            'Unsupported provider output representation; recovery is required',
          result: JSON.stringify(returned),
        });
        expect(finalizedOutputs).toEqual([]);
        expect(failedOutputs).toEqual([]);
      },
    );

    it('leaves an off-host slot pending instead of charging it as complete', async () => {
      seedBatch();

      await handler.handleCompleted(succeeded([FOREIGN_URL, SECOND_URL]));

      expect(finalizedOutputs).toEqual([
        [`${PREDICTION}_1`, IngredientCategory.IMAGE, SECOND_URL],
      ]);
      expect(failedOutputs).toEqual([]);
      expect(errors).toEqual(['Replicate batch output requires recovery']);
    });

    it('refuses a batch whose owner has no organization', async () => {
      seedBatch(undefined, {});

      await expect(
        handler.handleCompleted(succeeded(ALLOWED_URL)),
      ).rejects.toThrow('Replicate batch tenant identity is missing');
      expect(finalizedOutputs).toEqual([]);
    });
  });

  describe('asset generations', () => {
    const seedAsset = (fields: Row = {}) => {
      assets.push({
        category: 'banner',
        externalId: PREDICTION,
        id: 'asset_1',
        parentBrandId: 'brand-1',
        parentType: 'brand',
        userId: 'user_1',
        ...fields,
      });
    };

    it.each([
      ['a bare string', ALLOWED_URL],
      ['the first array entry', [ALLOWED_URL, FOREIGN_URL]],
    ])('uploads %s served by Replicate', async (_case, output) => {
      seedAsset();

      await handler.handleCompleted(succeeded(output));

      expect(assetUploads).toEqual([['asset_1', ALLOWED_URL]]);
      expect(finalizedOutputs).toEqual([]);
    });

    it.each([
      [
        'an off-host URL',
        [FOREIGN_URL],
        ['Replicate webhook: asset output URL rejected by host allowlist'],
        [],
      ],
      ['no URL', [], [], ['Replicate webhook: no output URL for asset']],
    ])('uploads nothing for %s', async (_case, output, logged, warned) => {
      seedAsset();

      await handler.handleCompleted(succeeded(output));

      expect(assetUploads).toEqual([]);
      expect(errors).toEqual(logged);
      expect(warnings).toEqual(warned);
    });

    it('marks a failed asset deleted and tells its owner', async () => {
      seedAsset();

      await handler.handleFailed(failed('failed', 'NSFW content'));

      expect(assets[0]).toMatchObject({ isDeleted: true });
      expect(assetStatuses).toEqual([
        {
          assetId: 'asset_1',
          details: {
            assetId: 'asset_1',
            category: 'banner',
            error: 'NSFW content',
            parentId: 'brand-1',
            parentType: 'brand',
            predictionId: PREDICTION,
          },
          status: 'failed',
          userId: 'user_1',
        },
      ]);
      expect(failedOutputs).toEqual([]);
    });

    it('marks an ownerless failed asset deleted without notifying anyone', async () => {
      seedAsset({ userId: undefined });

      await handler.handleFailed(failed('failed'));

      expect(assets[0]).toMatchObject({ isDeleted: true });
      expect(assetStatuses).toEqual([]);
    });
  });

  describe('failed generations', () => {
    it.each([
      ['the provider error', failed('failed', 'NSFW content'), 'NSFW content'],
      ['a canceled message', failed('canceled'), 'Generation was canceled'],
      ['a generic message', failed('failed'), 'Generation failed'],
    ])('fails the output with %s', async (_case, payload, error) => {
      await handler.handleFailed(payload);

      expect(failedOutputs).toEqual([[PREDICTION, error]]);
    });
  });
});
