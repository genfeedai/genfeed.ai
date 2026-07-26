import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationProviderResult,
  ImageGenerationSaveDocumentsResult,
  ImageGenerationSavedIngredient,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

/**
 * Coordinates provider-neutral output persistence and completion behavior.
 * Provider request construction and response normalization live in the typed
 * adapters behind {@link ImageGenerationProviderRegistryService}.
 */
@Injectable()
export class ImageGenerationProviderDispatchService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly filesClientService: FilesClientService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  supports(model: string): boolean {
    return this.providerRegistry.supports(model);
  }

  async dispatch(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationCompletionPlan | null> {
    const provider = await this.providerRegistry.prepare({
      brandPromptBranding: context.brandPromptBranding,
      createImageDto: context.createImageDto,
      height: context.height,
      model: context.model,
      organizationId: context.publicMetadata.organization,
      outputs: context.outputs,
      prompt: context.promptData.original,
      promptBuilderBrand: context.promptBuilderBrand,
      promptId: context.promptData.id,
      referenceImageUrl: context.referenceImageUrl,
      referenceImageUrls: context.referenceImageUrls,
      style: context.style,
      width: context.width,
    });

    if (!provider || provider.completionKind === 'none') {
      return null;
    }

    const pollIds = [context.ingredientData.id.toString()];
    const generationPromise = this.execute(context, provider, pollIds);

    return {
      generationPromise,
      kind: provider.completionKind,
      ...(provider.completionKind === 'poll-multiple' ? { pollIds } : {}),
    };
  }

  async createPlaceholderActivity(
    context: ImageGenerationContext,
    ingredientId: string,
  ): Promise<void> {
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: context.brand.id,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_PROCESSING,
        organization: context.publicMetadata.organization,
        source: ActivitySource.IMAGE_GENERATION,
        user: context.publicMetadata.user,
        value: JSON.stringify({
          ingredientId: ingredientId.toString(),
          model: context.model,
          type: 'generation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Image Generation',
      progress: 0,
      room: getUserRoomName(context.user.id),
      status: 'processing',
      taskId: ingredientId.toString(),
      userId: context.user.id,
    });
  }

  private execute(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<unknown> {
    if (provider.completionKind === 'inline') {
      return this.executeInline(context, provider);
    }
    if (context.outputs <= 1) {
      return this.executeSingle(context, provider);
    }
    if (provider.outputStrategy === 'batch') {
      return this.executeBatch(context, provider, pollIds);
    }
    if (provider.outputStrategy === 'sequential') {
      return this.executeSequential(context, provider, pollIds);
    }
    return this.executeSingle(context, provider);
  }

  private async executeInline(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
  ): Promise<string> {
    try {
      const result = await provider.generate();
      if (result.kind !== 'inline-buffer') {
        throw new Error('Inline image provider returned an external result');
      }

      const uploadMeta = await this.filesClientService.uploadToS3(
        context.ingredientData.id.toString(),
        'images',
        {
          contentType: 'image/png',
          data: result.imageBuffer,
          type: FileInputType.BUFFER,
        },
      );

      await Promise.all([
        this.metadataService.patch(
          context.metadataData.id,
          new MetadataEntity({
            height: uploadMeta.height,
            prompt: context.promptData.id,
            size: uploadMeta.size,
            width: uploadMeta.width,
          }),
        ),
        this.imagesService.patch(context.ingredientData.id, {
          cdnUrl:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : undefined,
          prompt: context.promptData.id,
          s3Key:
            typeof uploadMeta.s3Key === 'string' ? uploadMeta.s3Key : undefined,
          status: IngredientStatus.GENERATED,
        }),
        this.websocketService.publishVideoComplete(
          context.websocketUrl,
          {
            id: context.ingredientData.id.toString(),
            ingredientId: context.ingredientData.id.toString(),
            status: 'completed',
          },
          context.user.id,
          getUserRoomName(context.user.id),
        ),
      ]);

      return context.ingredientData.id.toString();
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }
  }

  private async executeSingle(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
  ): Promise<string> {
    try {
      const result = await provider.generate();
      const externalId = this.externalId(result);
      await this.patchExternalId(context.metadataData.id, result);
      return externalId;
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }
  }

  private async executeBatch(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<string> {
    try {
      const result = await provider.generate();
      const generationId = this.externalId(result);
      await this.metadataService.patch(
        context.metadataData.id,
        new MetadataEntity({ externalId: `${generationId}_0` }),
      );

      const additionalDocuments = await Promise.all(
        Array.from({ length: context.outputs - 1 }, () =>
          this.createAdditionalDocuments(context),
        ),
      );

      await Promise.all(
        additionalDocuments.flatMap(
          ({ metadataData, ingredientData }, index) => [
            this.metadataService.patch(
              metadataData.id,
              new MetadataEntity({
                externalId: `${generationId}_${index + 1}`,
              }),
            ),
            this.imagesService.patch(ingredientData.id, {
              prompt: context.promptData.id,
            }),
          ],
        ),
      );
      await Promise.all(
        additionalDocuments.map(({ ingredientData }) =>
          this.createPlaceholderActivity(context, ingredientData.id),
        ),
      );
      additionalDocuments.forEach(({ ingredientData }) => {
        pollIds.push(ingredientData.id.toString());
      });

      this.loggerService.log(
        'Created multiple placeholders for batch-capable model multi-output',
        {
          generationId,
          isBatchSupported: true,
          model: context.model,
          outputs: context.outputs,
        },
      );
      return generationId;
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }
  }

  private async executeSequential(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<string> {
    let primaryId: string;
    try {
      const primaryResult = await provider.generate();
      primaryId = this.externalId(primaryResult);
      await this.patchExternalId(context.metadataData.id, primaryResult);
    } catch (error: unknown) {
      return this.handleProviderFailure(context, error, provider.failureLabel);
    }

    for (let index = 1; index < context.outputs; index += 1) {
      await this.createSequentialOutput(context, provider, pollIds);
    }

    if (context.outputs > 1 && !provider.trackAdditionalOutputsInResponse) {
      this.loggerService.log(
        'Created multiple API calls for non-batch model multi-output',
        {
          isBatchSupported: false,
          model: context.model,
          outputs: context.outputs,
        },
      );
    }
    return primaryId;
  }

  private async createSequentialOutput(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<void> {
    let ingredientId: ImageGenerationSavedIngredient['id'] | null = null;
    try {
      const documents = await this.createAdditionalDocuments(context);
      ingredientId = documents.ingredientData.id;
      const result = await provider.generate();
      await Promise.all([
        this.patchExternalId(documents.metadataData.id, result),
        this.imagesService.patch(documents.ingredientData.id, {
          prompt: context.promptData.id,
        }),
      ]);

      try {
        await this.createPlaceholderActivity(
          context,
          documents.ingredientData.id,
        );
      } catch (activityError: unknown) {
        if (provider.additionalActivityFailure === 'fail') {
          throw activityError;
        }
        this.loggerService.error(
          'Failed to publish placeholder activity for additional output',
          { error: activityError },
        );
      }

      const id = documents.ingredientData.id.toString();
      if (provider.trackAdditionalOutputsInResponse) {
        context.pendingIngredientIds.push(id);
      } else {
        pollIds.push(id);
      }
    } catch (error: unknown) {
      if (ingredientId) {
        return this.handleProviderFailure(
          context,
          error,
          provider.additionalFailureLabel,
          ingredientId,
        );
      }
      this.loggerService.error(
        `${provider.additionalPlaceholderFailureLabel} additional output failed before its placeholder was created`,
        error,
      );
      throw error;
    }
  }

  private createAdditionalDocuments(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationSaveDocumentsResult> {
    return this.sharedService.saveDocuments(context.user, {
      ...context.createImageDto,
      brand: context.brand.id,
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.JPG,
      model: context.model,
      organization: context.publicMetadata.organization,
      parent: context.ingredientData.parent,
      prompt: context.promptData.id,
      status: IngredientStatus.PROCESSING,
    });
  }

  private patchExternalId(
    metadataId: string,
    result: ImageGenerationProviderResult,
  ): Promise<unknown> {
    const externalId = this.externalId(result);
    return this.metadataService.patch(
      metadataId,
      new MetadataEntity({
        externalId,
        ...(result.promptId ? { prompt: result.promptId } : {}),
      }),
    );
  }

  private externalId(result: ImageGenerationProviderResult): string {
    if (result.kind !== 'external-id' || !result.externalId) {
      throw new Error('Image provider returned no external ID');
    }
    return result.externalId;
  }

  private async handleProviderFailure(
    context: ImageGenerationContext,
    error: unknown,
    label: string,
    ingredientId: ImageGenerationSavedIngredient['id'] = context.ingredientData
      .id,
  ): Promise<never> {
    this.loggerService.error(`${label} failed`, error);
    const errorMessage = getErrorMessage(error);

    await this.failedGenerationService.handleFailedImageGeneration(
      this.imagesService,
      ingredientId,
      WebSocketPaths.image(ingredientId),
      context.publicMetadata,
      getUserRoomName(context.user.id),
      errorMessage,
    );
    throw error;
  }
}
