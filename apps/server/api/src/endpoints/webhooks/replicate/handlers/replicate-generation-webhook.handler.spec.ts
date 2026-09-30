import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ModelCategory } from '@genfeedai/contracts';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const ALLOWED_URL = 'https://replicate.delivery/pbxt/abc/out-0.png';
const FOREIGN_URL = 'https://evil.example.com/out-0.png';

describe('ReplicateGenerationWebhookHandler', () => {
  let handler: ReplicateGenerationWebhookHandler;
  let assetsService: { findOne: vi.Mock; patch: vi.Mock };
  let ingredientsService: { findOne: vi.Mock };
  let metadataService: { findOne: vi.Mock };
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };
  let webhooksService: {
    handleFailedGeneration: vi.Mock;
    processAssetFromWebhook: vi.Mock;
    processMediaForIngredient: vi.Mock;
    processMediaFromWebhook: vi.Mock;
    handleFailedGenerationForIngredient: vi.Mock;
  };

  const payloadWith = (output: unknown): ReplicateWebhookPayload =>
    ({
      id: 'pred_123',
      model: 'owner/some-model',
      output,
      status: 'succeeded',
    }) as unknown as ReplicateWebhookPayload;

  beforeEach(async () => {
    assetsService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn(),
    };
    // No ingredient/metadata record found by default — falls back to the
    // model-registry guess so the pre-existing IMAGE-default tests keep
    // passing unchanged.
    ingredientsService = { findOne: vi.fn().mockResolvedValue(null) };
    metadataService = { findOne: vi.fn().mockResolvedValue(null) };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    webhooksService = {
      handleFailedGeneration: vi.fn(),
      handleFailedGenerationForIngredient: vi.fn(),
      processAssetFromWebhook: vi.fn(),
      processMediaForIngredient: vi.fn(),
      processMediaFromWebhook: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateGenerationWebhookHandler,
        { provide: AssetsService, useValue: assetsService },
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: MetadataService, useValue: metadataService },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              category: ModelCategory.IMAGE,
            }),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { publishAssetStatus: vi.fn() },
        },
        { provide: WebhooksService, useValue: webhooksService },
        {
          provide: WorkflowNodeContinuationCoordinatorService,
          useValue: {
            completeProviderAction: vi.fn(),
            failProviderAction: vi.fn(),
          },
        },
        {
          provide: WorkflowNodeContinuationService,
          useValue: { findCallbackTarget: vi.fn() },
        },
      ],
    }).compile();

    handler = module.get(ReplicateGenerationWebhookHandler);
  });

  describe('media generation output', () => {
    it('fetches an output URL served by Replicate', async () => {
      await handler.handleCompleted(payloadWith(ALLOWED_URL));

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        expect.anything(),
        'pred_123',
        ALLOWED_URL,
      );
    });

    it('finalizes by continuation identity before the provider id metadata patch lands', async () => {
      const continuations = (
        handler as never as { continuations: { findCallbackTarget: vi.Mock } }
      ).continuations;
      continuations.findCallbackTarget.mockResolvedValue({
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
      });

      await handler.handleCompleted(payloadWith(ALLOWED_URL), 'continuation-1');

      expect(webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
        'ingredient-1',
        expect.anything(),
        ALLOWED_URL,
        'pred_123',
      );
      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
    });

    it('refuses to fetch an output URL on a foreign host', async () => {
      await handler.handleCompleted(payloadWith(FOREIGN_URL));

      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        expect.objectContaining({ predictionId: 'pred_123' }),
      );
    });

    it('drops only the foreign entries of a mixed output array', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL, ALLOWED_URL]));

      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledTimes(1);
      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        expect.anything(),
        'pred_123_1',
        ALLOWED_URL,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        { index: 0, predictionId: 'pred_123' },
      );
    });

    it('warns when an array carries no usable URL at all', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL]));

      expect(webhooksService.processMediaFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('no URLs'),
        expect.objectContaining({ predictionId: 'pred_123' }),
      );
    });

    it("classifies by the job's own recorded ingredient category, not the model registry guess", async () => {
      // The model registry lookup (mocked to IMAGE in beforeEach) is a stale
      // or missing row here — the persisted ingredient is MUSIC and must win,
      // so a music job is never misfiled as an image (#4679).
      metadataService.findOne.mockResolvedValue({ id: 'metadata-1' });
      ingredientsService.findOne.mockResolvedValue({
        category: 'MUSIC',
        id: 'ingredient-1',
      });

      await handler.handleCompleted(payloadWith(ALLOWED_URL));

      expect(metadataService.findOne).toHaveBeenCalledWith({
        externalId: 'pred_123',
      });
      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        metadataId: 'metadata-1',
      });
      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        'MUSIC',
        'pred_123',
        ALLOWED_URL,
      );
    });

    it('falls back to the base externalId when the indexed one has no metadata', async () => {
      const indexedPayload = {
        id: 'pred123_0',
        model: 'owner/some-model',
        output: ALLOWED_URL,
        status: 'succeeded',
      } as unknown as ReplicateWebhookPayload;
      metadataService.findOne.mockImplementation(
        ({ externalId }: { externalId: string }) =>
          Promise.resolve(
            externalId === 'pred123' ? { id: 'metadata-1' } : null,
          ),
      );
      ingredientsService.findOne.mockResolvedValue({
        category: 'MUSIC',
        id: 'ingredient-1',
      });

      await handler.handleCompleted(indexedPayload);

      expect(metadataService.findOne).toHaveBeenCalledWith({
        externalId: 'pred123_0',
      });
      expect(metadataService.findOne).toHaveBeenCalledWith({
        externalId: 'pred123',
      });
      expect(webhooksService.processMediaFromWebhook).toHaveBeenCalledWith(
        'replicate',
        'MUSIC',
        expect.any(String),
        ALLOWED_URL,
      );
    });

    it('resolves the continuation path category from the target ingredient, not the payload model', async () => {
      const continuations = (
        handler as never as { continuations: { findCallbackTarget: vi.Mock } }
      ).continuations;
      continuations.findCallbackTarget.mockResolvedValue({
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
      });
      ingredientsService.findOne.mockResolvedValue({
        category: 'MUSIC',
        id: 'ingredient-1',
      });

      await handler.handleCompleted(payloadWith(ALLOWED_URL), 'continuation-1');

      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        id: 'ingredient-1',
      });
      expect(webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
        'ingredient-1',
        'MUSIC',
        ALLOWED_URL,
        'pred_123',
      );
    });
  });

  describe('asset generation output', () => {
    const asset = { id: 'asset_1', userId: 'user_1' } as AssetDocument;

    beforeEach(() => {
      assetsService.findOne.mockResolvedValue(asset);
    });

    it('uploads an asset URL served by Replicate', async () => {
      await handler.handleCompleted(payloadWith([ALLOWED_URL]));

      expect(webhooksService.processAssetFromWebhook).toHaveBeenCalledWith(
        'replicate',
        'asset_1',
        ALLOWED_URL,
      );
    });

    it('refuses to upload an asset URL on a foreign host', async () => {
      await handler.handleCompleted(payloadWith([FOREIGN_URL]));

      expect(webhooksService.processAssetFromWebhook).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('rejected by host allowlist'),
        expect.objectContaining({ assetId: 'asset_1' }),
      );
    });
  });
});
