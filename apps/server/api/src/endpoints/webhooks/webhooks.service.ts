import { AssetsService } from '@api/collections/assets/services/assets.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { extractUserIds } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { validateRoomMatch } from '@api/helpers/utils/websocket-room/websocket-room.util';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  categoryToMediaType,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  normalizeCategory,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WebhooksService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly activityUpdateService: ActivityUpdateService,
    private readonly assetsService: AssetsService,
    private readonly autoMergeService: AutoMergeService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly mediaGenerationCostService: MediaGenerationCostService,
    private readonly mediaUploadService: MediaUploadService,
    private readonly metadataLookupService: MetadataLookupService,
    private readonly metadataService: MetadataService,
    private readonly notificationsService: NotificationsService,
    private readonly postProcessingOrchestrator: PostProcessingOrchestratorService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async processMediaFromWebhook(
    integration: string,
    category: IngredientCategory | string,
    externalId: string,
    url: string,
  ) {
    const logContext = `${this.constructorName} processMediaFromWebhook`;
    const categoryValue = normalizeCategory(category);

    // 1. Metadata + ingredient lookup
    const { metadata, ingredient: rawIngredient } =
      await this.metadataLookupService.lookupMetadataAndIngredient(
        externalId,
        categoryValue,
        url,
        integration,
      );

    this.loggerService.log(
      `${logContext} processing ${categoryValue} from ${integration}`,
      { externalId, url },
    );

    const ingredientId = rawIngredient.id;
    const metadataId = metadata.id;

    if (!ingredientId || !metadataId) {
      throw new Error('Webhook lookup returned records without stable ids');
    }

    await this.finalizeWebhookMedia({
      categoryValue,
      externalId,
      ingredientId,
      integration,
      metadataId,
      url,
    });
  }

  async processMediaForIngredient(
    ingredientId: string,
    category: IngredientCategory | string,
    url: string,
    externalId?: string,
  ): Promise<void> {
    const categoryValue = normalizeCategory(category);
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
    });

    if (!ingredient) {
      throw new Error(`Ingredient ${ingredientId} not found`);
    }

    const metadataId = ingredient.metadataId;

    if (!metadataId) {
      throw new Error(
        `Ingredient ${ingredientId} is missing metadata and cannot be finalized`,
      );
    }

    await this.finalizeWebhookMedia({
      categoryValue,
      externalId,
      ingredientId,
      integration: 'direct',
      metadataId,
      url,
    });
  }

  private async finalizeWebhookMedia(input: {
    categoryValue: IngredientCategory;
    ingredientId: string;
    metadataId: string;
    url: string;
    integration: string;
    externalId?: string;
  }): Promise<void> {
    const logContext = `${this.constructorName} finalizeWebhookMedia`;

    const current = await this.ingredientsService.findOne({
      id: input.ingredientId,
    });
    if (!current || current.status !== IngredientStatus.PROCESSING) {
      this.loggerService.log(
        `${logContext} skipping finalize — generation is no longer in progress`,
        {
          ingredientId: input.ingredientId,
          status: current?.status ?? null,
        },
      );
      return;
    }

    await this.metadataService.patch(input.metadataId, {
      ...(input.externalId ? { externalId: input.externalId } : {}),
      result: input.url,
    });

    // 2. S3 upload + dimension update
    const uploadMetadata =
      await this.mediaUploadService.uploadAndUpdateMetadata(
        input.ingredientId,
        input.categoryValue,
        input.url,
        input.metadataId,
        input.externalId,
      );

    // Re-populate the user after patch to preserve the canonical relation.
    const ingredient = await this.ingredientsService.findOne({
      id: input.ingredientId,
    });
    const metadata = await this.metadataService.findOne({
      id: input.metadataId,
    });

    if (!ingredient) {
      this.loggerService.error(
        `${logContext} ingredient not found after patch`,
        {
          ingredientId: input.ingredientId,
        },
      );
      throw new Error('Ingredient not found after patch');
    }

    if (ingredient.status !== IngredientStatus.PROCESSING) {
      this.loggerService.log(
        `${logContext} skipping generated status — generation is no longer in progress`,
        {
          ingredientId: input.ingredientId,
          status: ingredient.status,
        },
      );
      return;
    }

    // 3. Mark ingredient as GENERATED
    const cdnUrl =
      typeof uploadMetadata.publicUrl === 'string'
        ? uploadMetadata.publicUrl
        : undefined;
    const s3Key =
      typeof uploadMetadata.s3Key === 'string'
        ? uploadMetadata.s3Key
        : undefined;

    await this.ingredientsService.patch(input.ingredientId, {
      ...(cdnUrl ? { cdnUrl } : {}),
      ...(s3Key ? { s3Key } : {}),
      status: IngredientStatus.GENERATED,
    });

    // 3.5 Vendor-cost ledger row from the realized output (fire-and-forget;
    // the service swallows every failure so it can never break finalization).
    const generationMetadata = metadata as {
      duration?: number;
      height?: number;
      model?: string;
      width?: number;
    } | null;
    void this.mediaGenerationCostService.recordGenerationCost({
      brandId: ingredient.brandId ?? null,
      category: input.categoryValue,
      durationSeconds: generationMetadata?.duration ?? null,
      height: generationMetadata?.height ?? null,
      ingredientId: input.ingredientId,
      modelKey: generationMetadata?.model ?? null,
      organizationId: ingredient.organizationId ?? null,
      width: generationMetadata?.width ?? null,
    });

    // 4. Post-processing (fire-and-forget)
    this.postProcessingOrchestrator.notifyBotGatewayIfNeeded(
      String(ingredient.id),
      input.categoryValue,
    );
    this.schedulePostUploadNotifications(
      String(ingredient.id),
      input.categoryValue,
      input.integration,
    );
    this.postProcessingOrchestrator.triggerAutoEvaluationIfEnabled(
      ingredient as IngredientDocument,
    );
    this.autoMergeService.triggerAutoMergeIfReady(
      ingredient as IngredientDocument,
    );

    // 5. Resolve the canonical user identity and websocket room.
    const { dbUserId, userId, userRoom } = extractUserIds(ingredient.userId);

    // 6. Activity update
    if (dbUserId) {
      await this.activityUpdateService.updateSuccessActivity({
        brandId: ingredient.brandId ?? undefined,
        category: ingredient.category as IngredientCategory | string,
        dbUserId,
        ingredientId: ingredient.id.toString(),
        metadataExtension: metadata?.extension,
        organizationId: ingredient.organizationId ?? undefined,
        transformations: ingredient.transformations || [],
        userId,
        userRoom,
      });
    }

    // 7. WebSocket publish
    const ingredientId = ingredient.id.toString();
    const websocketUrl = `/${categoryToPlural(input.categoryValue)}/${ingredientId}`;
    const roomValidation = validateRoomMatch(userId);

    if (!roomValidation.isValid && dbUserId) {
      this.loggerService.warn(`${logContext} ${roomValidation.warning}`, {
        dbUserId,
        ingredientId: ingredient.id,
      });
    }

    if (userId) {
      this.loggerService.log(`${logContext} publishing WebSocket event`, {
        dbUserId,
        ingredientId,
        userId,
        userRoom: userRoom || `${getUserRoomName(userId)} (fallback)`,
        websocketUrl,
      });

      await this.websocketService.publishVideoComplete(
        websocketUrl,
        { id: ingredientId, ingredientId, status: 'completed' },
        userId,
        userRoom,
      );
    } else {
      this.loggerService.warn(
        `${logContext} no userId available for WebSocket notification`,
        { ingredientId, ingredientUserId: ingredient.userId },
      );
    }

    // 8. Cache invalidation
    await this.cacheService.invalidateByTags([
      categoryToPlural(input.categoryValue),
    ]);

    this.loggerService.log(
      `${logContext} generated successfully`,
      `${this.configService.ingredientsEndpoint}/${categoryToPlural(input.categoryValue)}/${String(ingredient.id)}`,
    );
  }

  async handleFailedGeneration(externalId: string, errorMessage?: string) {
    const logContext = `${this.constructorName} handleFailedGeneration`;

    try {
      const metadata = await this.metadataService.findOne({
        externalId,
      });

      if (!metadata) {
        this.loggerService.warn(`${logContext} metadata not found`, {
          externalId,
        });
        return;
      }

      const ingredient = await this.ingredientsService.findOne({
        metadataId: metadata.id,
      });
      if (!ingredient) {
        // The failure reason still belongs on the metadata record when the
        // provider gave up before any ingredient row existed for it.
        if (errorMessage) {
          await this.metadataService.patch(metadata.id, {
            error: errorMessage,
          });
        }
        this.loggerService.warn(`${logContext} ingredient not found`, {
          externalId,
        });
        return;
      }

      await this.handleFailedGenerationForIngredient(
        ingredient.id.toString(),
        errorMessage,
      );
    } catch (error: unknown) {
      this.loggerService.error(`${logContext} error`, error);
    }
  }

  async handleFailedGenerationForIngredient(
    ingredientId: string,
    errorMessage?: string,
  ): Promise<void> {
    const logContext = `${this.constructorName} handleFailedGenerationForIngredient`;

    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
    });
    if (!ingredient) {
      this.loggerService.warn(`${logContext} ingredient not found`, {
        ingredientId,
      });
      return;
    }

    if (errorMessage) {
      const metadataId = ingredient.metadataId;
      if (metadataId) {
        await this.metadataService.patch(metadataId, {
          error: errorMessage,
        });
      }
    }

    await this.ingredientsService.patch(ingredient.id.toString(), {
      status: IngredientStatus.FAILED,
    });

    this.postProcessingOrchestrator.notifyBotGatewayFailureIfNeeded(
      ingredient.id.toString(),
      errorMessage || 'Generation failed',
    );

    const { dbUserId, userId, userRoom } = extractUserIds(ingredient.userId);

    // Activity update via decomposed service
    if (dbUserId) {
      await this.activityUpdateService.updateFailureActivity({
        brandId: ingredient.brandId ?? undefined,
        category: ingredient.category as IngredientCategory | string,
        dbUserId,
        errorMessage,
        ingredientId: ingredient.id.toString(),
        organizationId: ingredient.organizationId ?? undefined,
        userId,
        userRoom,
      });
    }

    // WebSocket failure notification
    const websocketUrl = `/${categoryToPlural(ingredient.category)}/${String(ingredient.id)}`;

    if (userId) {
      await this.websocketService.publishMediaFailed(
        websocketUrl,
        errorMessage || 'Generation failed',
        userId,
        userRoom,
      );
    }

    this.loggerService.log(`${logContext} marked as failed`, {
      error: errorMessage,
      ingredientId: ingredient.id,
    });

    await this.cacheService.invalidateByTags([
      categoryToPlural(ingredient.category),
    ]);
  }

  private schedulePostUploadNotifications(
    ingredientId: string,
    categoryValue: IngredientCategory | string,
    integration: string,
  ): void {
    setImmediate(() => {
      this.sendDiscordNotificationAsync(
        ingredientId,
        categoryValue,
        integration,
      ).catch((error: unknown) => {
        this.loggerService.error(
          `${this.constructorName} Discord notification failed`,
          error,
        );
      });
    });
  }

  private async sendDiscordNotificationAsync(
    ingredientId: string,
    categoryValue: IngredientCategory | string,
    integration: string,
  ): Promise<void> {
    const ingredient = await this.ingredientsService.findOne(
      { id: ingredientId },
      [
        { path: 'prompt', select: ['original'] },
        {
          path: 'metadata',
          select: [
            'width',
            'height',
            'duration',
            'model',
            'externalProvider',
            'hasAudio',
          ],
        },
        { path: 'brand', select: ['label'] },
      ],
    );

    if (!ingredient) {
      return;
    }

    const ingredientCategory = categoryToMediaType(categoryValue);
    const cdnUrl = `${this.configService.ingredientsEndpoint}/${ingredientCategory}s/${ingredientId}`;
    const metadata = ingredient.metadata as
      | {
          width?: number;
          height?: number;
          duration?: number;
          model?: string;
          externalProvider?: string;
        }
      | undefined;
    const prompt = ingredient.prompt as { original?: string } | undefined;
    const brand = ingredient.brand as { label?: string } | undefined;
    let thumbnailUrl: string | undefined;

    if (ingredientCategory === 'video') {
      const thumbnailStartTime = Date.now();
      try {
        const thumbnail = await this.filesClientService.generateThumbnail(
          cdnUrl,
          ingredientId,
          1,
          720,
        );
        thumbnailUrl = thumbnail.thumbnailUrl;
        this.loggerService.log(
          `${this.constructorName} generated thumbnail for video`,
          {
            ingredientId,
            thumbnailDuration: `${Date.now() - thumbnailStartTime}ms`,
            thumbnailUrl,
          },
        );
      } catch (error: unknown) {
        this.loggerService.warn(
          `${this.constructorName} thumbnail generation failed (non-fatal)`,
          {
            duration: `${Date.now() - thumbnailStartTime}ms`,
            error: getErrorMessage(error),
            ingredientId,
          },
        );
      }
    }

    await this.notificationsService.sendIngredientNotification(
      categoryValue as IngredientCategory,
      cdnUrl,
      {
        brand,
        id: ingredient.id,
        metadata: {
          ...metadata,
          model: metadata?.model || integration,
        },
        prompt,
        thumbnailUrl,
      },
    );
  }

  async processAssetFromWebhook(
    integration: string,
    assetId: string,
    url: string,
  ) {
    const logContext = `${this.constructorName} processAssetFromWebhook`;

    try {
      const asset = await this.assetsService.findOne({ id: assetId });

      if (!asset) {
        this.loggerService.error(`${logContext} asset not found`, { assetId });
        throw new Error('Asset not found');
      }

      this.loggerService.log(
        `${logContext} processing asset from ${integration}`,
        { assetId, category: asset.category, url },
      );

      await this.filesClientService.uploadToS3(
        assetId,
        categoryToPlural(asset.category),
        { type: FileInputType.URL, url },
      );

      const userId = asset.userId ?? undefined;

      if (userId) {
        const parentId =
          asset.parentBrandId ??
          asset.parentOrgId ??
          asset.parentIngredientId ??
          asset.parentArticleId ??
          undefined;

        await this.websocketService.publishAssetStatus(
          assetId.toString(),
          'completed',
          userId,
          {
            assetId: assetId.toString(),
            category: asset.category,
            parentId,
            parentType: asset.parentType,
          },
        );

        this.loggerService.log(`${logContext} published websocket event`, {
          assetId,
          category: asset.category,
          userId,
        });
      }

      this.loggerService.log(`${logContext} completed`, {
        assetId,
        category: asset.category,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${logContext} failed`, error);
      throw error;
    }
  }
}
