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
import {
  resolveImageDispatchExecutePath,
  shouldFailAdditionalActivity,
  shouldTrackSequentialOutputInResponse,
} from '@api/collections/images/services/image-generation-dispatch-path.util';
import {
  isProcessingIngredient,
  missingOutputUrlMessage,
  optionalUploadString,
  shouldFinalizeExternalOutput,
} from '@api/collections/images/services/image-generation-output.util';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { isGenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { toRedactedGenerationBriefProviderData } from '@api/services/generation-brief';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { GenerationWebhookOutput } from '@api-types/contracts/generation-webhook-events.contract';
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

interface RealizedImageDimensions {
  height?: number;
  width?: number;
}

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
    private readonly generationEventWebhookService: GenerationEventWebhookService,
    private readonly mediaGenerationCostService: MediaGenerationCostService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  supports(
    model: string,
    provider?: ImageGenerationContext['modelProvider'],
  ): boolean {
    return this.providerRegistry.supports(model, provider);
  }

  async dispatch(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationCompletionPlan | null> {
    const provider = await this.providerRegistry.prepare({
      abortSignal: context.abortSignal,
      brandPromptBranding: context.brandPromptBranding,
      compiledDispatch: context.compiledDispatch,
      createImageDto: context.createImageDto,
      height: context.height,
      model: context.model,
      modelEndpoint: context.modelEndpoint,
      modelInputSchema: context.modelInputSchema,
      modelProvider: context.modelProvider,
      modelSchemaFamily: context.modelSchemaFamily,
      onExternalJobCreated: async (externalId) => {
        await this.metadataService.patch(
          context.metadataData.id,
          new MetadataEntity({
            externalId,
            externalProvider:
              this.providerRegistry.providerFor(
                context.model,
                context.modelProvider,
              ) ?? undefined,
          }),
        );
      },
      organizationId: context.user.organizationId,
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

    const externalProvider = this.providerRegistry.providerFor(
      context.model,
      context.modelProvider,
    );
    if (externalProvider) {
      await this.metadataService.patch(
        context.metadataData.id,
        new MetadataEntity({ externalProvider }),
      );
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
        brandId: context.brand.id,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_PROCESSING,
        organizationId: context.user.organizationId,
        source: ActivitySource.IMAGE_GENERATION,
        userId: context.user.userId,
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

  failPlaceholderBeforeDispatch(
    context: ImageGenerationContext,
    error: unknown,
  ): Promise<never> {
    return this.handleProviderFailure(
      context,
      error,
      'Image generation placeholder linkage',
    );
  }

  private execute(
    context: ImageGenerationContext,
    provider: PreparedImageGenerationProvider,
    pollIds: string[],
  ): Promise<unknown> {
    const path = resolveImageDispatchExecutePath({
      completionKind: provider.completionKind,
      outputStrategy: provider.outputStrategy,
      outputs: context.outputs,
    });
    if (path === 'inline') {
      return this.executeInline(context, provider);
    }
    if (path === 'batch') {
      return this.executeBatch(context, provider, pollIds);
    }
    if (path === 'sequential') {
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
            promptId: context.promptData.id,
            size: uploadMeta.size,
            width: uploadMeta.width,
          }),
        ),
        this.imagesService.patch(context.ingredientData.id, {
          cdnUrl:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : undefined,
          promptId: context.promptData.id,
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

      await this.emitGenerationCompleted(
        context,
        context.ingredientData.id,
        {
          mimeType: 'image/png',
          storageKey:
            typeof uploadMeta.s3Key === 'string' ? uploadMeta.s3Key : null,
          url:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : null,
        },
        { height: uploadMeta.height, width: uploadMeta.width },
      );

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
      await this.patchExternalId(context.metadataData.id, result, context);
      await this.finalizeReturnedOutput(
        context,
        context.ingredientData.id,
        context.metadataData.id,
        result,
      );
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
              promptId: context.promptData.id,
            }),
          ],
        ),
      );

      const documents = [
        {
          ingredientData: context.ingredientData,
          metadataData: context.metadataData,
        },
        ...additionalDocuments,
      ];
      await Promise.all(
        documents.map(({ ingredientData, metadataData }, index) =>
          this.finalizeReturnedOutput(
            context,
            ingredientData.id,
            metadataData.id,
            result,
            index,
          ),
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
      await this.patchExternalId(
        context.metadataData.id,
        primaryResult,
        context,
      );
      await this.finalizeReturnedOutput(
        context,
        context.ingredientData.id,
        context.metadataData.id,
        primaryResult,
      );
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
        this.patchExternalId(documents.metadataData.id, result, context),
        this.imagesService.patch(documents.ingredientData.id, {
          promptId: context.promptData.id,
        }),
      ]);
      await this.finalizeReturnedOutput(
        context,
        documents.ingredientData.id,
        documents.metadataData.id,
        result,
      );

      try {
        await this.createPlaceholderActivity(
          context,
          documents.ingredientData.id,
        );
      } catch (activityError: unknown) {
        if (shouldFailAdditionalActivity(provider.additionalActivityFailure)) {
          throw activityError;
        }
        this.loggerService.error(
          'Failed to publish placeholder activity for additional output',
          { error: activityError },
        );
      }

      const id = documents.ingredientData.id.toString();
      if (
        shouldTrackSequentialOutputInResponse(
          provider.trackAdditionalOutputsInResponse,
        )
      ) {
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
    return this.sharedService.createMediaDocuments(context.user, {
      brandId: context.brand.id,
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.JPG,
      generationPrompt: context.promptData.original,
      generationSeed: context.createImageDto.seed,
      ...(context.generationSource
        ? { generationSource: context.generationSource }
        : {}),
      ...(context.briefEvidence
        ? {
            providerData: toRedactedGenerationBriefProviderData(
              context.briefEvidence,
            ),
          }
        : {}),
      model: context.model,
      negativePrompt: context.createImageDto.negativePrompt,
      organizationId: context.user.organizationId,
      parentId: context.ingredientData.parentId ?? undefined,
      promptId: context.promptData.id,
      scope: context.createImageDto.scope,
      sourceIds: context.referenceIds,
      status: IngredientStatus.PROCESSING,
      style: context.style,
      tagIds: context.createImageDto.tags,
    });
  }

  private patchExternalId(
    metadataId: string,
    result: ImageGenerationProviderResult,
    context: ImageGenerationContext,
  ): Promise<unknown> {
    const externalId = this.externalId(result);
    return this.metadataService.patch(
      metadataId,
      new MetadataEntity({
        externalId,
        externalProvider:
          this.providerRegistry.providerFor(
            context.model,
            context.modelProvider,
          ) ?? undefined,
        ...(result.kind === 'external-id' && result.promptId
          ? { promptId: result.promptId }
          : {}),
      }),
    );
  }

  private async finalizeReturnedOutput(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
    metadataId: string,
    result: ImageGenerationProviderResult,
    outputIndex = 0,
  ): Promise<void> {
    if (!shouldFinalizeExternalOutput(result)) {
      return;
    }

    const current = await this.imagesService.findOne({ id: ingredientId });
    if (!isProcessingIngredient(current)) {
      return;
    }

    const outputUrl = result.outputUrls?.[outputIndex];
    if (!outputUrl) {
      throw new Error(missingOutputUrlMessage(outputIndex));
    }

    const id = ingredientId.toString();
    const uploadMeta = await this.filesClientService.uploadToS3(id, 'images', {
      type: FileInputType.URL,
      url: outputUrl,
    });

    await Promise.all([
      this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          height: uploadMeta.height,
          result: outputUrl,
          size: uploadMeta.size,
          width: uploadMeta.width,
        }),
      ),
      this.imagesService.patch(ingredientId, {
        cdnUrl: optionalUploadString(uploadMeta.publicUrl),
        promptId: context.promptData.id,
        s3Key: optionalUploadString(uploadMeta.s3Key),
        status: IngredientStatus.GENERATED,
      }),
      this.websocketService.publishVideoComplete(
        WebSocketPaths.image(ingredientId),
        { id, ingredientId: id, status: 'completed' },
        context.user.id,
        getUserRoomName(context.user.id),
      ),
    ]);

    await this.emitGenerationCompleted(
      context,
      ingredientId,
      {
        mimeType: null,
        storageKey: optionalUploadString(uploadMeta.s3Key) ?? null,
        url: optionalUploadString(uploadMeta.publicUrl) ?? outputUrl,
      },
      { height: uploadMeta.height, width: uploadMeta.width },
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
    if (isGenerationCancelledError(error)) {
      throw error;
    }

    this.loggerService.error(`${label} failed`, error);
    const errorMessage = getErrorMessage(error);

    await this.failedGenerationService.handleFailedImageGeneration(
      this.imagesService,
      ingredientId,
      WebSocketPaths.image(ingredientId),
      context.user,
      getUserRoomName(context.user.id),
      errorMessage,
    );

    await this.generationEventWebhookService.emitGenerationFailed({
      brandId: context.brand.id?.toString() ?? null,
      errorMessage,
      generationId: ingredientId.toString(),
      kind: 'image',
      model: context.model,
      organizationId: context.user.organizationId,
    });

    throw error;
  }

  private async emitGenerationCompleted(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
    output: GenerationWebhookOutput,
    dimensions: RealizedImageDimensions,
  ): Promise<void> {
    await this.mediaGenerationCostService.recordGenerationCost({
      brandId: context.brand.id?.toString() ?? null,
      category: 'image',
      height: dimensions.height ?? null,
      ingredientId: ingredientId.toString(),
      modelKey: context.model,
      organizationId: context.user.organizationId,
      width: dimensions.width ?? null,
    });

    await this.generationEventWebhookService.emitGenerationCompleted({
      brandId: context.brand.id?.toString() ?? null,
      generationId: ingredientId.toString(),
      kind: 'image',
      model: context.model,
      organizationId: context.user.organizationId,
      output,
    });
  }
}
