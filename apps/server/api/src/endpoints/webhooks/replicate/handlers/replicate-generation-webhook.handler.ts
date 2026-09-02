import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { supportsMultipleOutputs } from '@genfeedai/contracts/constants';
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
    private readonly continuationCoordinator: WorkflowNodeContinuationCoordinatorService,
    private readonly continuations: WorkflowNodeContinuationService,
  ) {}

  /**
   * Handles a completed/succeeded webhook that isn't tied to a training —
   * either an asset generation (banner/logo) or a regular media generation.
   */
  async handleCompleted(
    payload: ReplicateWebhookPayload,
    workflowContinuationId?: string,
  ): Promise<void> {
    // Check if this is an asset generation first
    const asset = await this.assetsService.findOne({
      externalId: payload.id,
    });

    if (asset) {
      await this.handleAssetGenerationCompleted(asset, payload);
    } else {
      await this.handleMediaGenerationCompleted(
        payload,
        workflowContinuationId,
      );
    }
  }

  /**
   * Handles a failed/errored webhook — either a failed asset generation or
   * a failed ingredient generation.
   */
  async handleFailed(
    payload: ReplicateWebhookPayload,
    workflowContinuationId?: string,
  ): Promise<void> {
    // Check if this is a failed asset generation first
    const asset = await this.assetsService.findOne({
      externalId: payload.id,
    });

    if (asset) {
      await this.handleAssetGenerationFailed(asset, payload);
    } else {
      if (workflowContinuationId) {
        const target = await this.continuations.findCallbackTarget({
          continuationId: workflowContinuationId,
          provider: 'replicate',
        });
        if (!target) {
          throw new Error(
            `Replicate workflow continuation ${workflowContinuationId} not found`,
          );
        }
        if (target.externalId && target.externalId !== payload.id) {
          throw new Error(
            `Replicate callback ${payload.id} does not own continuation ${workflowContinuationId}`,
          );
        }
        const error =
          typeof payload.error === 'string'
            ? payload.error
            : 'Replicate generation failed';
        await this.webhooksService.handleFailedGenerationForIngredient(
          target.ingredientId,
          error,
        );
        await this.continuationCoordinator.failProviderAction({
          error,
          identity: {
            continuationId: workflowContinuationId,
            organizationId: target.organizationId,
          },
          provider: 'replicate',
          providerResult: { externalId: payload.id },
        });
        return;
      }

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

    if (isAllowedReplicateOutputUrl(imageUrl)) {
      await this.webhooksService.processAssetFromWebhook(
        'replicate',
        asset.id,
        imageUrl,
      );
    } else if (imageUrl) {
      // A URL that is present but off-host is the forged-callback signature,
      // not vendor drift — fetching it would be the SSRF.
      this.loggerService.error(
        'Replicate webhook: asset output URL rejected by host allowlist',
        {
          assetId: asset.id,
          predictionId: payload.id,
          status: payload.status,
        },
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
    workflowContinuationId?: string,
  ): Promise<void> {
    const ingredientCategory = await this.resolveIngredientCategory(payload);
    const output = payload.output;

    if (workflowContinuationId) {
      const target = await this.continuations.findCallbackTarget({
        continuationId: workflowContinuationId,
        provider: 'replicate',
      });
      if (!target) {
        throw new Error(
          `Replicate workflow continuation ${workflowContinuationId} not found`,
        );
      }
      if (target.externalId && target.externalId !== payload.id) {
        throw new Error(
          `Replicate callback ${payload.id} does not own continuation ${workflowContinuationId}`,
        );
      }
      const workflowOutputUrl = Array.isArray(output)
        ? output.find((candidate) => isAllowedReplicateOutputUrl(candidate))
        : isAllowedReplicateOutputUrl(output)
          ? output
          : undefined;
      if (!workflowOutputUrl) {
        this.loggerService.warn(
          'Replicate workflow callback has no allowed output URL',
          { continuationId: workflowContinuationId, predictionId: payload.id },
        );
        return;
      }
      await this.webhooksService.processMediaForIngredient(
        target.ingredientId,
        ingredientCategory,
        workflowOutputUrl,
        payload.id,
      );
      await this.continuationCoordinator.completeProviderAction({
        identity: {
          continuationId: workflowContinuationId,
          organizationId: target.organizationId,
        },
        provider: 'replicate',
        providerResult: { externalId: payload.id },
      });
      return;
    }

    // Check if the model supports multiple outputs
    // Extract model key from payload (format: "owner/model-name" or ModelKey)
    // @ts-expect-error TS2339
    const extractedModelKey = payload.model?.split('/').pop() || '';
    const modelSupportsMultiOutputs =
      supportsMultipleOutputs(extractedModelKey);

    if (Array.isArray(output)) {
      const uploadTasks = output
        .map((url, index) => {
          if (!isAllowedReplicateOutputUrl(url)) {
            if (url) {
              this.loggerService.error(
                'Replicate webhook: output URL rejected by host allowlist',
                { index, predictionId: payload.id },
              );
            }
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
    } else if (isAllowedReplicateOutputUrl(output)) {
      await this.webhooksService.processMediaFromWebhook(
        'replicate',
        ingredientCategory,
        payload.id,
        output,
      );
    } else if (typeof output === 'string') {
      this.loggerService.error(
        'Replicate webhook: output URL rejected by host allowlist',
        { model: payload.model, predictionId: payload.id },
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

    // Notify the canonical owning user when one exists.
    const userId = asset.userId;
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
