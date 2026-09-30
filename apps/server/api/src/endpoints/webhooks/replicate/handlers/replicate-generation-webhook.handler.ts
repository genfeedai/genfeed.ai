import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
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
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
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
   * The job's own persisted category — read from the ingredient row created
   * at dispatch time — is the source of truth for classification. Guessing
   * from the model registry is only a fallback for the rare case where no
   * ingredient can be found yet (e.g. the registry row was deleted after the
   * job started): a missing/stale registry row must never silently
   * reclassify an existing music (or video) job as IMAGE (#4679).
   */
  private async resolveIngredientCategory(
    payload: ReplicateWebhookPayload,
  ): Promise<IngredientCategory> {
    const byIngredient = await this.resolveIngredientCategoryFromRecord(
      payload.id,
    );
    if (byIngredient) {
      return byIngredient;
    }

    return this.resolveIngredientCategoryFromModelRegistry(payload.model);
  }

  /**
   * Reads the category straight off the ingredient tied to this prediction's
   * metadata, following the same indexed-then-base-id fallback the rest of
   * the webhook pipeline uses for a multi-output externalId.
   */
  private async resolveIngredientCategoryFromRecord(
    externalId: string,
  ): Promise<IngredientCategory | null> {
    const metadata =
      (await this.metadataService.findOne({ externalId })) ??
      (await this.metadataService.findOne({
        externalId: `${externalId}_0`,
        externalProvider: 'replicate',
      })) ??
      (externalId.includes('_')
        ? await this.metadataService.findOne({
            externalId: externalId.split('_')[0],
          })
        : null);

    if (!metadata) {
      return null;
    }

    const ingredient = await this.ingredientsService.findOne({
      metadataId: metadata.id,
    });

    return ingredient?.category
      ? (ingredient.category as IngredientCategory)
      : null;
  }

  /**
   * Resolves a category directly from an ingredient id, used on the workflow
   * continuation path where the ingredient is already known.
   */
  private async resolveIngredientCategoryForIngredient(
    ingredientId: string,
  ): Promise<IngredientCategory> {
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
    });

    if (ingredient?.category) {
      return ingredient.category as IngredientCategory;
    }

    this.loggerService.warn(
      'Replicate webhook: ingredient not found for workflow continuation, defaulting to IMAGE category',
      { ingredientId },
    );
    return IngredientCategory.IMAGE;
  }

  private async resolveIngredientCategoryFromModelRegistry(
    modelKey: unknown,
  ): Promise<IngredientCategory> {
    const model = await this.modelsService.findOne({
      key: modelKey,
    });

    if (!model?.category) {
      // Fallback: if model not found in DB, default to IMAGE
      this.loggerService.warn(
        `Model not found in database, defaulting to IMAGE category`,
        { modelKey },
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
      const targetIngredient = await this.ingredientsService.findOne({
        id: target.ingredientId,
        organizationId: target.organizationId,
        isDeleted: false,
      });
      const workflowOutputUrl = await this.requireSingleOutput(
        payload,
        targetIngredient?.metadataId ?? undefined,
      );
      if (!workflowOutputUrl) {
        this.loggerService.warn(
          'Replicate workflow callback has no allowed output URL',
          { continuationId: workflowContinuationId, predictionId: payload.id },
        );
        return;
      }
      const ingredientCategory =
        await this.resolveIngredientCategoryForIngredient(target.ingredientId);
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

    const ingredientCategory = await this.resolveIngredientCategory(payload);

    // Persisted indexed metadata proves native dispatch. A provider cap may return just one output.
    const primaryIdentity = {
      externalId: `${payload.id}_0`,
      externalProvider: 'replicate',
    };
    const batchPrimary =
      (await this.metadataService.findOne({
        ...primaryIdentity,
        isDeleted: false,
      })) ??
      (await this.metadataService.findOne({
        ...primaryIdentity,
        isDeleted: true,
      }));
    if (batchPrimary) {
      await this.completePersistedBatch(
        payload,
        output,
        ingredientCategory,
        batchPrimary.id,
      );
      return;
    }

    const singleOutput = await this.requireSingleOutput(payload);
    if (isAllowedReplicateOutputUrl(singleOutput)) {
      await this.webhooksService.processMediaFromWebhook(
        'replicate',
        ingredientCategory,
        payload.id,
        singleOutput,
      );
    } else if (typeof singleOutput === 'string') {
      this.loggerService.error(
        'Replicate webhook: output URL rejected by host allowlist',
        { model: payload.model, predictionId: payload.id },
      );
      this.loggerService.warn(
        'Replicate webhook: output array contained no URLs',
        { predictionId: payload.id },
      );
    }
  }

  private async requireSingleOutput(
    payload: ReplicateWebhookPayload,
    metadataId?: string,
  ): Promise<string | undefined> {
    const output: unknown = payload.output;
    const validShape =
      typeof output === 'string' ||
      (Array.isArray(output) &&
        output.every((entry) => typeof entry === 'string'));
    const outputs =
      typeof output === 'string'
        ? [output]
        : Array.isArray(output)
          ? output
          : [];
    if (!validShape || outputs.length !== 1) {
      const metadata = metadataId
        ? null
        : await this.metadataService.findOne({
            externalId: payload.id,
            externalProvider: 'replicate',
            isDeleted: false,
          });
      const targetId = metadataId ?? metadata?.id;
      if (targetId)
        await this.metadataService.patch(targetId, {
          result: JSON.stringify(output) ?? 'null',
          error:
            'Provider output does not match the single-output dispatch manifest; recovery is required',
        });
      this.loggerService.error(
        'Replicate single-output dispatch requires recovery',
        {
          predictionId: payload.id,
          hasMetadata: Boolean(targetId),
        },
      );
      throw new Error('Replicate single-output dispatch requires recovery');
    }
    return outputs[0];
  }

  private async completePersistedBatch(
    payload: ReplicateWebhookPayload,
    output: unknown,
    category: IngredientCategory,
    primaryMetadataId: string,
  ): Promise<void> {
    const ownerIdentity = { metadataId: primaryMetadataId };
    const owner =
      (await this.ingredientsService.findOne({
        ...ownerIdentity,
        isDeleted: false,
      })) ??
      (await this.ingredientsService.findOne({
        ...ownerIdentity,
        isDeleted: true,
      }));
    const organizationId = owner?.organizationId;
    if (!organizationId)
      throw new Error('Replicate batch tenant identity is missing');
    // Deleted library entries remain part of the original provider manifest.
    // Removing one cannot shrink the authorization for a still-funded retry.
    const records = await Promise.all(
      [false, true].map((isDeleted) =>
        this.metadataService.findAll(
          {
            where: {
              externalId: { startsWith: `${payload.id}_` },
              externalProvider: 'replicate',
              ingredients: {
                some: {
                  organizationId,
                  OR: [{ isDeleted: false }, { isDeleted: true }],
                },
              },
              isDeleted,
            },
          },
          { pagination: false },
          false,
        ),
      ),
    );
    const slots = [
      ...new Map(
        records.flatMap((record) => record.docs).map((row) => [row.id, row]),
      ).values(),
    ].filter((row) => {
      const suffix = row.externalId?.slice(payload.id.length + 1);
      return suffix !== undefined && /^\d+$/.test(suffix);
    });
    if (
      (typeof output !== 'string' && !Array.isArray(output)) ||
      (Array.isArray(output) &&
        output.some((entry) => typeof entry !== 'string'))
    ) {
      const primary = slots.find((row) => row.externalId === `${payload.id}_0`);
      if (primary)
        await this.metadataService.patch(primary.id, {
          result: JSON.stringify(output),
          error:
            'Unsupported provider output representation; recovery is required',
        });
      throw new Error('Replicate output representation requires recovery');
    }
    const returned =
      typeof output === 'string'
        ? [output]
        : Array.isArray(output)
          ? output
          : [];
    if (returned.length > slots.length) {
      const primary = slots.find((row) => row.externalId === `${payload.id}_0`);
      if (primary)
        await this.metadataService.patch(primary.id, {
          result: JSON.stringify(returned),
          error:
            'Provider returned more outputs than the funded dispatch manifest; recovery is required',
        });
      throw new Error(
        'Replicate output cardinality exceeds the funded dispatch manifest',
      );
    }
    await Promise.all(
      slots.map(async (slot) => {
        if (slot.isDeleted) return;
        const liveOwner = await this.ingredientsService.findOne({
          metadataId: slot.id,
          organizationId,
          isDeleted: false,
        });
        if (!liveOwner) return;
        const index = Number(slot.externalId?.slice(payload.id.length + 1));
        const url = returned[index];
        if (isAllowedReplicateOutputUrl(url)) {
          await this.webhooksService.processMediaFromWebhook(
            'replicate',
            category,
            String(slot.externalId),
            url,
          );
        } else if (index >= returned.length) {
          await this.webhooksService.handleFailedGeneration(
            String(slot.externalId),
            'Provider completed without producing this requested output',
          );
        } else {
          // Invalid/unknown artifact roles remain pending instead of being treated as successful images.
          this.loggerService.error('Replicate batch output requires recovery', {
            predictionId: payload.id,
            index,
          });
        }
      }),
    );
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
