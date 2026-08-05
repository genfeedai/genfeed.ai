import { AssetsService } from '@api/collections/assets/services/assets.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import {
  categoryToMediaType,
  categoryToPlural,
  normalizeCategory,
} from '@api/helpers/utils/category-conversion/category-conversion.util';
import { extractUserIds } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { validateRoomMatch } from '@api/helpers/utils/websocket-room/websocket-room.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

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
      isDeleted: false,
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

    await this.metadataService.patch(input.metadataId, {
      ...(input.externalId ? { externalId: input.externalId } : {}),
      result: input.url,
    });

    // 2. S3 upload + dimension update
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
      isDeleted: false,
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

    // 3. Mark ingredient as GENERATED
    await this.ingredientsService.patch(input.ingredientId, {
      status: IngredientStatus.GENERATED,
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

    // 5. Resolve the canonical user identity and compatibility room fields.
    const { dbUserId, authProviderUserId, userId, userRoom } = extractUserIds(
      ingredient.userId,
    );

    // 6. Activity update
    if (dbUserId) {
      await this.activityUpdateService.updateSuccessActivity({
        brandId: ingredient.brandId ?? undefined,
        category: ingredient.category as IngredientCategory | string,
        dbUserId,
        ingredientId: ingredient.id.toString(),
        metadataExtension: metadata?.extension,
        organizationId: ingredient.organizationId,
        transformations: ingredient.transformations || [],
        userId,
        userRoom,
      });
    }

    // 7. WebSocket publish
    const ingredientId = ingredient.id.toString();
    const websocketUrl = `/${categoryToPlural(input.categoryValue)}/${ingredientId}`;
    const roomValidation = validateRoomMatch(authProviderUserId, dbUserId);

    if (!roomValidation.isValid && dbUserId) {
      this.loggerService.warn(`${logContext} ${roomValidation.warning}`, {
        dbUserId,
        ingredientId: ingredient.id,
      });
    }

    if (userId) {
      this.loggerService.log(`${logContext} publishing WebSocket event`, {
        authProviderUserId,
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
        { ingredientId, ingredientUser: ingredient.user },
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
        isDeleted: false,
      });

      if (!metadata) {
        this.loggerService.warn(`${logContext} metadata not found`, {
          externalId,
        });
        return;
      }

      if (errorMessage) {
        const metadataId = metadata.id;
        if (metadataId) {
          await this.metadataService.patch(metadataId, {
            error: errorMessage,
          });
        }
      }

      const metadataId = metadata.id;
      const ingredient = await this.ingredientsService.findOne({ metadataId });

      if (!ingredient) {
        return;
      }

      await this.ingredientsService.patch(ingredient.id.toString(), {
        status: IngredientStatus.FAILED,
      });

      const { dbUserId, userId, userRoom } = extractUserIds(ingredient.userId);

      // Activity update via decomposed service
      if (dbUserId) {
        await this.activityUpdateService.updateFailureActivity({
          brandId: ingredient.brandId ?? undefined,
          category: ingredient.category as IngredientCategory | string,
          dbUserId,
          errorMessage,
          ingredientId: ingredient.id.toString(),
          organizationId: ingredient.organizationId,
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
        externalId,
        ingredientId: ingredient.id,
      });

      await this.cacheService.invalidateByTags([
        categoryToPlural(ingredient.category),
      ]);
    } catch (error: unknown) {
      this.loggerService.error(`${logContext} error`, error);
    }
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
        `${asset.category.toLowerCase()}s`,
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
