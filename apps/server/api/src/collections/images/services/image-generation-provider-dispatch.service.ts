import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationProvider,
  ImageGenerationSavedIngredient,
} from '@api/collections/images/services/image-generation.types';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

/**
 * Owns image-provider request construction, dispatch, normalization, and
 * provider-specific multi-output fan-out. Shared validation, credits,
 * persistence, polling, and response serialization remain in
 * {@link ImageGenerationService}.
 */
@Injectable()
export class ImageGenerationProviderDispatchService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly comfyUIService: ComfyUIService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly filesClientService: FilesClientService,
    private readonly falService: FalService,
    private readonly imagesService: ImagesService,
    private readonly klingAIService: KlingAIService,
    private readonly leonardoaiService: LeonardoAIService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async dispatch(
    context: ImageGenerationContext,
    provider: ImageGenerationProvider,
  ): Promise<ImageGenerationCompletionPlan | null> {
    switch (provider) {
      case 'genfeedai':
        return this.dispatchGenfeedAi(context);
      case 'klingai':
        return this.dispatchKlingAI(context);
      case 'fal':
        return this.dispatchFal(context);
      case 'leonardo':
        return this.dispatchLeonardo(context);
      case 'replicate':
        return this.dispatchReplicate(context);
      default:
        return null;
    }
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

  private dispatchGenfeedAi(
    context: ImageGenerationContext,
  ): ImageGenerationCompletionPlan {
    const {
      ingredientData,
      metadataData,
      promptData,
      referenceImageUrl,
      user,
      websocketUrl,
    } = context;

    const generationPromise = (async () => {
      const { imageBuffer } = await this.comfyUIService.generateImage(
        context.model,
        {
          faceImage: referenceImageUrl || undefined,
          height: context.height,
          prompt: promptData.original,
          seed: context.createImageDto.seed,
          width: context.width,
        },
      );

      const uploadMeta = await this.filesClientService.uploadToS3(
        ingredientData.id.toString(),
        'images',
        {
          contentType: 'image/png',
          data: imageBuffer,
          type: FileInputType.BUFFER,
        },
      );

      await Promise.all([
        this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            height: uploadMeta.height,
            prompt: promptData.id,
            size: uploadMeta.size,
            width: uploadMeta.width,
          }),
        ),
        this.imagesService.patch(ingredientData.id, {
          cdnUrl:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : undefined,
          prompt: promptData.id,
          s3Key:
            typeof uploadMeta.s3Key === 'string' ? uploadMeta.s3Key : undefined,
          status: IngredientStatus.GENERATED,
        }),
        this.websocketService.publishVideoComplete(
          websocketUrl,
          {
            id: ingredientData.id.toString(),
            ingredientId: ingredientData.id.toString(),
            status: 'completed',
          },
          user.id,
          getUserRoomName(user.id),
        ),
      ]);

      return ingredientData.id.toString();
    })().catch((error: unknown) =>
      this.handleProviderFailure(
        context,
        error,
        'ComfyUIService generateImage',
      ),
    );

    return { generationPromise, kind: 'inline' };
  }

  private dispatchKlingAI(
    context: ImageGenerationContext,
  ): ImageGenerationCompletionPlan {
    const { createImageDto, metadataData, promptData, referenceImageUrl } =
      context;

    const generationPromise = this.klingAIService
      .queueGenerateImage(promptData.original, {
        ...createImageDto,
        height: context.height,
        model: context.model,
        reference: referenceImageUrl || undefined,
        style: context.style || 'realistic',
        width: context.width,
      })
      .then(async (generationId) => {
        if (!generationId) {
          throw new Error('No generation ID returned from KlingAI');
        }

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: generationId,
            prompt: promptData.id,
          }),
        );

        return generationId;
      })
      .catch((error: unknown) =>
        this.handleProviderFailure(
          context,
          error,
          'KlingAIService generateImage',
        ),
      );

    return { generationPromise, kind: 'poll-single' };
  }

  private dispatchLeonardo(
    context: ImageGenerationContext,
  ): ImageGenerationCompletionPlan {
    const { createImageDto, metadataData, promptData } = context;

    const generationPromise = this.leonardoaiService
      .generateImage(promptData.original, {
        ...createImageDto,
        height: context.height,
        style: context.style || 'realistic',
        width: context.width,
      })
      .then(async (generationId) => {
        if (!generationId) {
          throw new Error('No generation ID returned from LeonardoAI');
        }

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: generationId,
          }),
        );

        return generationId;
      })
      .catch((error: unknown) =>
        this.handleProviderFailure(
          context,
          error,
          'LeonardoAIService generateImage',
        ),
      );

    return { generationPromise, kind: 'poll-single' };
  }

  private dispatchFal(
    context: ImageGenerationContext,
  ): ImageGenerationCompletionPlan {
    const {
      createImageDto,
      height,
      metadataData,
      promptData,
      referenceImageUrl,
      width,
    } = context;

    const buildFalInput = (): Record<string, unknown> => ({
      image_size: {
        height,
        width,
      },
      ...(referenceImageUrl ? { image_url: referenceImageUrl } : {}),
      ...(createImageDto.seed !== undefined
        ? { seed: createImageDto.seed }
        : {}),
      prompt: promptData.original,
    });

    const generationPromise = (async () => {
      let primaryUrl: string;
      try {
        const falResult = await this.falService.generateImage(
          context.model,
          buildFalInput(),
        );
        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: falResult.url,
            prompt: promptData.id,
          }),
        );
        primaryUrl = falResult.url;
      } catch (error: unknown) {
        return this.handleProviderFailure(
          context,
          error,
          'FalService generateImage',
          context.ingredientData.id,
        );
      }

      for (let i = 1; i < context.outputs; i++) {
        await this.createFalAdditionalOutput(context, buildFalInput);
      }

      return primaryUrl;
    })();

    return { generationPromise, kind: 'background-only' };
  }

  private async createFalAdditionalOutput(
    context: ImageGenerationContext,
    buildFalInput: () => Record<string, unknown>,
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    let additionalIngredientId: ImageGenerationSavedIngredient['id'] | null =
      null;
    try {
      const {
        metadataData: additionalMetadata,
        ingredientData: additionalIngredient,
      } = await this.sharedService.saveDocuments(context.user, {
        ...createImageDto,
        brand: brand.id,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        model: context.model,
        organization: publicMetadata.organization,
        parent: context.ingredientData.parent,
        prompt: promptData.id,
        status: IngredientStatus.PROCESSING,
      });
      additionalIngredientId = additionalIngredient.id;

      const additionalResult = await this.falService.generateImage(
        context.model,
        buildFalInput(),
      );

      await Promise.all([
        this.metadataService.patch(
          additionalMetadata.id,
          new MetadataEntity({
            externalId: additionalResult.url,
            prompt: promptData.id,
          }),
        ),
        this.imagesService.patch(additionalIngredient.id, {
          prompt: promptData.id,
        }),
      ]);

      try {
        await this.createPlaceholderActivity(context, additionalIngredient.id);
      } catch (activityError: unknown) {
        this.loggerService.error(
          'Failed to publish placeholder activity for additional output',
          { error: activityError },
        );
      }

      context.pendingIngredientIds.push(additionalIngredient.id.toString());
    } catch (error: unknown) {
      if (additionalIngredientId) {
        return this.handleProviderFailure(
          context,
          error,
          'FalService generateImage (additional output)',
          additionalIngredientId,
        );
      }
      this.loggerService.error(
        'Fal additional output failed before its placeholder was created',
        error,
      );
      throw error;
    }
  }

  private async dispatchReplicate(
    context: ImageGenerationContext,
  ): Promise<ImageGenerationCompletionPlan> {
    const {
      createImageDto,
      promptBuilderBrand,
      brandPromptBranding,
      promptData,
    } = context;

    const destination = context.model;
    const modelCapability = MODEL_OUTPUT_CAPABILITIES[destination];
    const isBatchSupported = modelCapability?.isBatchSupported ?? false;

    const { input: promptParams } = await this.promptBuilderService.buildPrompt(
      context.model,
      {
        blacklist: createImageDto.blacklist,
        brand: promptBuilderBrand,
        branding: brandPromptBranding,
        brandingMode: createImageDto.brandingMode,
        camera: createImageDto.camera,
        fontFamily: createImageDto.fontFamily,
        height: context.height,
        isBrandingEnabled: createImageDto.isBrandingEnabled,
        lens: createImageDto.lens,
        lighting: createImageDto.lighting,
        modelCategory: ModelCategory.IMAGE,
        mood: createImageDto.mood,
        outputs: isBatchSupported ? context.outputs : 1,
        prompt: promptData.original,
        promptTemplate: createImageDto.promptTemplate,
        references: context.referenceImageUrls,
        scene: createImageDto.scene,
        seed: createImageDto.seed,
        style: context.style || createImageDto.style || 'realistic',
        tags: createImageDto.tags?.map((tag) => tag.toString()) || [],
        useTemplate: createImageDto.useTemplate,
        width: context.width,
      },
      context.publicMetadata.organization,
    );

    const pollIds: string[] = [context.ingredientData.id.toString()];

    const generationPromise = (async () => {
      let generationId: string;
      try {
        const id = await this.replicateService.generateTextToImage(
          destination,
          promptParams,
        );
        if (!id) {
          throw new Error('No generation ID returned from Replicate');
        }
        generationId = id;
      } catch (error: unknown) {
        return this.handleProviderFailure(
          context,
          error,
          'ReplicateService generateImage',
          context.ingredientData.id,
        );
      }

      if (isBatchSupported && context.outputs > 1) {
        try {
          await this.createReplicateBatchOutputs(
            context,
            destination,
            generationId,
            pollIds,
          );
        } catch (error: unknown) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage',
            context.ingredientData.id,
          );
        }
      } else if (context.outputs > 1) {
        await this.createReplicateSequentialOutputs(
          context,
          destination,
          generationId,
          promptParams,
          pollIds,
        );
      } else {
        try {
          await this.metadataService.patch(
            context.metadataData.id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );
        } catch (error: unknown) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage',
            context.ingredientData.id,
          );
        }
      }

      return generationId;
    })();

    return { generationPromise, kind: 'poll-multiple', pollIds };
  }

  private async createReplicateBatchOutputs(
    context: ImageGenerationContext,
    destination: string,
    generationId: string,
    pollIds: string[],
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    await this.metadataService.patch(
      context.metadataData.id,
      new MetadataEntity({
        externalId: `${generationId}_0`,
      }),
    );

    const additionalDocuments = await Promise.all(
      Array.from({ length: context.outputs - 1 }, () => {
        return this.sharedService.saveDocuments(context.user, {
          ...createImageDto,
          brand: brand.id,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          model: context.model,
          organization: publicMetadata.organization,
          parent: context.ingredientData.parent,
          prompt: promptData.id,
          status: IngredientStatus.PROCESSING,
        });
      }),
    );

    await Promise.all(
      additionalDocuments.flatMap(
        ({ metadataData: addMeta, ingredientData: addIngredient }, index) => {
          const i = index + 1;
          return [
            this.metadataService.patch(
              addMeta.id,
              new MetadataEntity({
                externalId: `${generationId}_${i}`,
              }),
            ),
            this.imagesService.patch(addIngredient.id, {
              prompt: promptData.id,
            }),
          ];
        },
      ),
    );

    await Promise.all(
      additionalDocuments.map(({ ingredientData: addIngredient }) =>
        this.createPlaceholderActivity(context, addIngredient.id),
      ),
    );

    additionalDocuments.forEach(({ ingredientData: addIngredient }) => {
      pollIds.push(addIngredient.id.toString());
    });

    this.loggerService.log(
      'Created multiple placeholders for batch-capable model multi-output',
      {
        generationId,
        isBatchSupported: true,
        model: destination,
        outputs: context.outputs,
      },
    );
  }

  private async createReplicateSequentialOutputs(
    context: ImageGenerationContext,
    destination: string,
    generationId: string,
    promptParams: Record<string, unknown>,
    pollIds: string[],
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    try {
      await this.metadataService.patch(
        context.metadataData.id,
        new MetadataEntity({
          externalId: generationId,
        }),
      );
    } catch (error: unknown) {
      await this.handleProviderFailure(
        context,
        error,
        'ReplicateService generateImage',
        context.ingredientData.id,
      );
    }

    for (let i = 1; i < context.outputs; i++) {
      let additionalIngredientId: ImageGenerationSavedIngredient['id'] | null =
        null;
      try {
        const {
          metadataData: additionalMetadata,
          ingredientData: additionalIngredient,
        } = await this.sharedService.saveDocuments(context.user, {
          ...createImageDto,
          brand: brand.id,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          model: context.model,
          organization: publicMetadata.organization,
          parent: context.ingredientData.parent,
          prompt: promptData.id,
          status: IngredientStatus.PROCESSING,
        });
        additionalIngredientId = additionalIngredient.id;

        const additionalGenerationId =
          await this.replicateService.generateTextToImage(
            destination,
            promptParams,
          );
        if (!additionalGenerationId) {
          throw new Error('No generation ID returned from Replicate');
        }

        await Promise.all([
          this.metadataService.patch(
            additionalMetadata.id,
            new MetadataEntity({
              externalId: additionalGenerationId,
            }),
          ),
          this.imagesService.patch(additionalIngredient.id, {
            prompt: promptData.id,
          }),
        ]);

        await this.createPlaceholderActivity(context, additionalIngredient.id);
        pollIds.push(additionalIngredient.id.toString());
      } catch (error: unknown) {
        if (additionalIngredientId) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage (additional output)',
            additionalIngredientId,
          );
        }
        this.loggerService.error(
          'Replicate additional output failed before its placeholder was created',
          error,
        );
        throw error;
      }
    }

    this.loggerService.log(
      'Created multiple API calls for non-batch model multi-output',
      {
        isBatchSupported: false,
        model: destination,
        outputs: context.outputs,
      },
    );
  }
}
