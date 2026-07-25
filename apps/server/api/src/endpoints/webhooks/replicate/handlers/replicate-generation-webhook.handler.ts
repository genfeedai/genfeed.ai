import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { supportsMultipleOutputs } from '@genfeedai/constants';
import { IngredientCategory, ModelCategory } from '@genfeedai/enums';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Handles the non-training branches of the Replicate webhook: asset
 * (banner/logo) generations and regular ingredient media generations, both
 * on their completed and failed paths.
 */
@Injectable()
export class ReplicateGenerationWebhookHandler {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly assetsService: AssetsService,
    private readonly webhooksService: WebhooksService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /**
   * Handles a completed/succeeded webhook that isn't tied to a training —
   * either an asset generation (banner/logo) or a regular media generation.
   */
  async handleCompleted(payload: ReplicateWebhookPayload): Promise<void> {
    // Check if this is an asset generation first
    const asset = await this.assetsService.findOne({
      externalId: payload.id,
      isDeleted: false,
    });

    if (asset) {
      await this.handleAssetGenerationCompleted(asset, payload);
    } else {
      await this.handleMediaGenerationCompleted(payload);
    }
  }

  /**
   * Handles a failed/errored webhook — either a failed asset generation or
   * a failed ingredient generation.
   */
  async handleFailed(payload: ReplicateWebhookPayload): Promise<void> {
    // Check if this is a failed asset generation first
    const asset = await this.assetsService.findOne({
      externalId: payload.id,
      isDeleted: false,
    });

    if (asset) {
      await this.handleAssetGenerationFailed(asset, payload);
    } else {
      // Handle failed generation with error message for ingredients
      await this.webhooksService.handleFailedGeneration(
        payload.id,
        // @ts-expect-error TS2345
        payload.error || 'Generation failed',
      );
    }
  }

  /**
   * Uploads the generated asset (banner/logo) output to the asset record.
   */
  private async handleAssetGenerationCompleted(
    asset: AssetDocument,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const output = payload.output;
    const imageUrl =
      typeof output === 'string'
        ? output
        : Array.isArray(output) && output.length > 0
          ? output[0]
          : null;

    if (imageUrl && typeof imageUrl === 'string') {
      await this.webhooksService.processAssetFromWebhook(
        'replicate',
        asset.id,
        imageUrl,
      );
    } else {
      this.loggerService.warn('Replicate webhook: no output URL for asset', {
        assetId: asset.id,
        predictionId: payload.id,
        status: payload.status,
      });
    }
  }

  /**
   * Resolves the model's category into the matching ingredient category,
   * defaulting to IMAGE when the model can't be found.
   */
  private async resolveIngredientCategory(
    payload: ReplicateWebhookPayload,
  ): Promise<IngredientCategory> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: payload.model,
    });

    if (!model?.category) {
      // Fallback: if model not found in DB, default to IMAGE
      this.loggerService.warn(
        `Model not found in database, defaulting to IMAGE category`,
        { modelKey: payload.model },
      );
      return IngredientCategory.IMAGE;
    }

    switch (model.category) {
      case ModelCategory.VIDEO:
        return IngredientCategory.VIDEO;
      case ModelCategory.MUSIC:
        return IngredientCategory.MUSIC;
      default:
        return IngredientCategory.IMAGE;
    }
  }

  /**
   * Processes a regular (non-asset) media generation webhook — one or more
   * output URLs for an ingredient.
   */
  private async handleMediaGenerationCompleted(
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const ingredientCategory = await this.resolveIngredientCategory(payload);
    const output = payload.output;

    // Check if the model supports multiple outputs
    // Extract model key from payload (format: "owner/model-name" or ModelKey)
    // @ts-expect-error TS2339
    const extractedModelKey = payload.model?.split('/').pop() || '';
    const modelSupportsMultiOutputs =
      supportsMultipleOutputs(extractedModelKey);

    if (Array.isArray(output)) {
      const uploadTasks = output
        .map((url, index) => {
          if (typeof url !== 'string') {
            return null;
          }

          const externalId =
            modelSupportsMultiOutputs && output.length > 1
              ? `${payload.id}_${index}`
              : payload.id;

          return this.webhooksService.processMediaFromWebhook(
            'replicate',
            ingredientCategory,
            externalId,
            url,
          );
        })
        .filter((task): task is Promise<void> => Boolean(task));

      if (uploadTasks.length > 0) {
        const uploadResults = await Promise.allSettled(uploadTasks);
        uploadResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            this.loggerService.error(
              'Replicate webhook: failed to process output',
              {
                error: result.reason,
                index,
                predictionId: payload.id,
              },
            );
          }
        });
      } else {
        this.loggerService.warn(
          'Replicate webhook: output array contained no URLs',
          { model: payload.model, predictionId: payload.id },
        );
      }
    } else if (typeof output === 'string') {
      await this.webhooksService.processMediaFromWebhook(
        'replicate',
        ingredientCategory,
        payload.id,
        output,
      );
    } else {
      // No direct URL(s) available — log and skip
      this.loggerService.warn('Replicate webhook: no output URLs to process', {
        hasOutput: !!output,
        id: payload.id,
        model: payload.model,
        status: payload.status,
      });
    }
  }

  /**
   * Marks a failed asset generation as deleted and notifies the owning
   * user, when resolvable, via websocket.
   */
  private async handleAssetGenerationFailed(
    asset: AssetDocument,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    this.loggerService.error('Replicate webhook: asset generation failed', {
      assetId: asset.id,
      error: payload.error,
      predictionId: payload.id,
    });

    // Mark asset as deleted to indicate failure
    await this.assetsService.patch(String(asset.id), {
      isDeleted: true,
    });

    // Notify user via websocket. Scalar FK first: `user` is a Mongo-era
    // relation alias that this un-populated query only carries because
    // `BaseService.normalizeDocument` back-fills it from `userId`. If it
    // were ever absent, `String(undefined)` would yield the truthy string
    // `"undefined"` and publish the failure event to a bogus recipient
    // instead of skipping it.
    const userId = resolveRelationId(asset.userId, asset.user);
    if (userId) {
      await this.websocketService.publishAssetStatus(
        String(asset.id),
        'failed',
        userId,
        {
          assetId: String(asset.id),
          category: asset.category,
          error: payload.error || 'Asset generation failed',
          predictionId: payload.id,
        },
      );
    }
  }
}
