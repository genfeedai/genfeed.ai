import { AssetsService } from '@api/collections/assets/services/assets.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
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
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { UserExtractionUtil } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { validateRoomMatch } from '@api/helpers/utils/websocket-room/websocket-room.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { IIngredientNotificationData } from '@genfeedai/interfaces';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

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
    private readonly usersService: UsersService,
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

    await this.finalizeWebhookMedia({
      categoryValue,
      externalId,
      ingredientId: rawIngredient._id.toString(),
      integration,
      metadataId: metadata._id.toString(),
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
    const ingredient = await this.ingredientsService.findOne(
      { _id: new Types.ObjectId(ingredientId), isDeleted: false },
      [PopulatePatterns.userMinimal],
    );

    if (!ingredient) {
      throw new Error(`Ingredient ${ingredientId} not found`);
    }

    const metadataId =
      ingredient.metadata &&
      typeof ingredient.metadata === 'object' &&
      '_id' in ingredient.metadata
        ? String(
            (ingredient.metadata as { _id: string | { toString(): string } })
              ._id,
          )
        : String(ingredient.metadata);

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

    // Re-populate user after patch to ensure we have clerkId
    const ingredient = await this.ingredientsService.findOne(
      { _id: new Types.ObjectId(input.ingredientId) },
      [PopulatePatterns.userMinimal],
    );
    const metadata = await this.metadataService.findOne({
      _id: new Types.ObjectId(input.metadataId),
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
      String(ingredient._id),
      input.categoryValue,
    );
    this.schedulePostUploadNotifications(
      String(ingredient._id),
      input.categoryValue,
      input.integration,
    );
    this.postProcessingOrchestrator.triggerAutoEvaluationIfEnabled(
      ingredient as IngredientDocument,
    );
    this.autoMergeService.triggerAutoMergeIfReady(
      ingredient as IngredientDocument,
    );

    // 5. Resolve user IDs (with clerkId fallback)
    let { dbUserId, clerkUserId, userId, userRoom } =
      UserExtractionUtil.extractUserIds(ingredient.user);

    if (!clerkUserId && dbUserId) {
      try {
        const fullUser = await this.usersService.findOne({
          _id: new Types.ObjectId(dbUserId),
        });
        if (fullUser?.clerkId) {
          clerkUserId = fullUser.clerkId;
          userId = clerkUserId;
          userRoom = `user-${clerkUserId}`;
          this.loggerService.debug(
            `${logContext} found clerkId by fetching full user document`,
            { clerkUserId, dbUserId },
          );
        }
      } catch (error: unknown) {
        this.loggerService.warn(
          `${logContext} failed to fetch full user for clerkId lookup`,
          { dbUserId, error: getErrorMessage(error) },
        );
      }
    }

    // 6. Activity update
    if (dbUserId) {
      await this.activityUpdateService.updateSuccessActivity({
        brandId: ingredient.brand,
        category: ingredient.category as IngredientCategory | string,
        dbUserId,
        ingredientId: ingredient._id.toString(),
        metadataExtension: metadata?.extension,
        organizationId: ingredient.organization,
        transformations: ingredient.transformations || [],
        userId,
        userRoom,
      });
    }

    // 7. WebSocket publish
    const ingredientId = ingredient._id.toString();
    const websocketUrl = `/${categoryToPlural(input.categoryValue)}/${ingredientId}`;
    const roomValidation = validateRoomMatch(clerkUserId, dbUserId);

    if (!roomValidation.isValid && dbUserId) {
      this.loggerService.warn(`${logContext} ${roomValidation.warning}`, {
        dbUserId,
        ingredientId: ingredient._id,
      });
    }

    if (userId) {
      this.loggerService.log(`${logContext} publishing WebSocket event`, {
        clerkUserId,
        dbUserId,
        ingredientId,
        userId,
        userRoom: userRoom || `user-${userId} (fallback)`,
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
      `${this.configService.ingredientsEndpoint}/${categoryToPlural(input.categoryValue)}/${String(ingredient._id)}`,
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
        await this.metadataService.patch(metadata._id, { error: errorMessage });
      }

      const ingredient = await this.ingredientsService.findOne(
        { metadata: metadata._id },
        [PopulatePatterns.userMinimal],
      );

      if (!ingredient) {
        return;
      }

      await this.ingredientsService.patch(ingredient._id.toString(), {
        status: IngredientStatus.FAILED,
      });

      const { dbUserId, userId, userRoom } = UserExtractionUtil.extractUserIds(
        ingredient.user,
      );

      // Activity update via decomposed service
      if (dbUserId) {
        await this.activityUpdateService.updateFailureActivity({
          brandId: ingredient.brand,
          category: ingredient.category as IngredientCategory | string,
          dbUserId,
          errorMessage,
          ingredientId: ingredient._id.toString(),
          organizationId: ingredient.organization,
          userId,
          userRoom,
        });
      }

      // WebSocket failure notification
      const websocketUrl = `/${categoryToPlural(ingredient.category)}/${String(ingredient._id)}`;

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
        ingredientId: ingredient._id,
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
      { _id: ingredientId },
      [
        { path: 'prompt', select: 'original' },
        {
          path: 'metadata',
          select: 'width height duration model externalProvider hasAudio',
        },
        { path: 'brand', select: 'label' },
      ],
    );

    if (!ingredient) {
      return;
    }

    const ingredientCategory = categoryToMediaType(categoryValue);
    const cdnUrl = `${this.configService.ingredientsEndpoint}/${ingredientCategory}s/${ingredientId}`;

    const metadata = ingredient.metadata as {
      width?: number;
      height?: number;
      duration?: number;
      model?: string;
      externalProvider?: string;
      hasAudio?: boolean;
    };

    const discordEmbed: {
      title: string;
      description: string;
      fields: Array<{ name: string; value: string; inline: boolean }>;
      image?: string;
      videoUrl?: string;
      thumbnailUrl?: string;
    } = {
      description: `\`${(ingredient.prompt as unknown as { original?: string })?.original || 'N/A'}\``,
      fields: [],
      title: `New ${ingredientCategory.charAt(0).toUpperCase() + ingredientCategory.slice(1)} Generated`,
    };

    if (ingredientCategory === 'image') {
      discordEmbed.image = cdnUrl;
      discordEmbed.fields.push(
        {
          inline: true,
          name: 'Resolution',
          value: `${metadata?.width || 0}x${metadata?.height || 0}`,
        },
        {
          inline: true,
          name: 'Model',
          value: metadata?.model || integration || 'N/A',
        },
      );
      if (metadata?.externalProvider) {
        discordEmbed.fields.push({
          inline: true,
          name: 'Provider',
          value: metadata.externalProvider,
        });
      }
    } else if (ingredientCategory === 'video') {
      let thumbnailUrl: string | undefined;
      const thumbnailStartTime = Date.now();
      try {
        const thumbnailResult = await this.filesClientService.generateThumbnail(
          cdnUrl,
          ingredientId,
          1,
          720,
        );
        thumbnailUrl = thumbnailResult.thumbnailUrl;
        const thumbnailDuration = Date.now() - thumbnailStartTime;
        this.loggerService.log(
          `${this.constructorName} generated thumbnail for video`,
          {
            ingredientId,
            thumbnailDuration: `${thumbnailDuration}ms`,
            thumbnailUrl,
          },
        );
      } catch (error: unknown) {
        const thumbnailDuration = Date.now() - thumbnailStartTime;
        this.loggerService.warn(
          `${this.constructorName} thumbnail generation failed (non-fatal)`,
          {
            duration: `${thumbnailDuration}ms`,
            error: getErrorMessage(error),
            ingredientId,
          },
        );
      }

      discordEmbed.videoUrl = cdnUrl;
      if (thumbnailUrl) {
        discordEmbed.thumbnailUrl = thumbnailUrl;
      }

      discordEmbed.fields.push(
        {
          inline: true,
          name: 'Duration',
          value: metadata?.duration ? `${metadata.duration}s` : 'N/A',
        },
        {
          inline: true,
          name: 'Resolution',
          value: `${metadata?.width || 0}x${metadata?.height || 0}`,
        },
      );
      if (metadata?.hasAudio !== undefined) {
        discordEmbed.fields.push({
          inline: true,
          name: 'Audio',
          value: metadata.hasAudio ? 'Yes' : 'No',
        });
      }
      discordEmbed.fields.push({
        inline: true,
        name: 'Model',
        value: metadata?.model || integration || 'N/A',
      });
      if (metadata?.externalProvider) {
        discordEmbed.fields.push({
          inline: true,
          name: 'Provider',
          value: metadata.externalProvider,
        });
      }
    }

    await this.notificationsService.sendIngredientNotification(
      categoryValue as IngredientCategory,
      cdnUrl,
      ingredient as unknown as IIngredientNotificationData,
    );
  }

  async processAssetFromWebhook(
    integration: string,
    assetId: string,
    url: string,
  ) {
    const logContext = `${this.constructorName} processAssetFromWebhook`;

    try {
      const asset = await this.assetsService.findOne({ _id: assetId }, [
        { path: 'user', select: '_id clerkId' },
      ]);

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

      const { userId } = UserExtractionUtil.extractUserIds(asset.user);

      if (userId) {
        await this.websocketService.publishAssetStatus(
          assetId.toString(),
          'completed',
          userId,
          {
            assetId: assetId.toString(),
            category: asset.category,
            parent: asset.parent?.toString(),
            parentModel: asset.parentModel,
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
