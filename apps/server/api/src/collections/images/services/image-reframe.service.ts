import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { ImagesService } from '@server/collections/images/services/images.service';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@server/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { PromptEntity } from '@server/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@server/collections/prompts/services/prompts.service';
import { CategoryPrismaUtil } from '@server/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@server/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@server/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@server/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
import type { Request } from 'express';

const LEGACY_CONTROLLER_NAME = 'ImagesTransformationsController';

@Injectable()
export class ImageReframeService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async reframeImage(
    request: Request,
    imageId: string,
    user: User,
    createImageDto: CreateImageDto,
  ): Promise<IngredientDocument> {
    let url = `${LEGACY_CONTROLLER_NAME} reframeImage`;
    this.loggerService.log(url, { body: createImageDto, params: { imageId } });

    const parent = await this.imagesService.findOne(
      {
        id: imageId,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        userId: user.userId ?? user.id,
      },
      [PopulatePatterns.metadataFull],
    );

    if (!parent) {
      throw new HttpException(
        {
          detail: 'Parent image not found',
          title: 'Invalid parent ingredient',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const format = createImageDto.format || 'landscape';
    let targetWidth = createImageDto.width;
    let targetHeight = createImageDto.height;

    if (!targetWidth || !targetHeight) {
      if (format === 'square') {
        targetWidth = 1080;
        targetHeight = 1080;
      } else if (format === 'portrait') {
        targetWidth = 1080;
        targetHeight = 1920;
      } else {
        targetWidth = 1920;
        targetHeight = 1080;
      }
    }

    const promptText =
      createImageDto.text || `Reframe image to ${format} format`;
    const promptData = await this.promptsService.create(
      new PromptEntity({
        brandId: parent.brandId ?? user.brandId,
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        organizationId: user.organizationId,
        original:
          typeof promptText === 'string'
            ? promptText
            : String(promptText ?? ''),
        status: PromptStatus.PROCESSING,
        userId: user.userId ?? user.id,
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        brandId: parent.brandId ?? user.brandId,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        extension: MetadataExtension.JPEG,
        generationPrompt: promptData.original,
        generationSeed: createImageDto.seed,
        height: targetHeight,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        negativePrompt: createImageDto.negativePrompt,
        organizationId: parent.organizationId ?? user.organizationId,
        parentId: parent.id,
        promptId: promptData.id,
        scope: createImageDto.scope,
        sourceIds: createImageDto.references,
        status: IngredientStatus.PROCESSING,
        tagIds: createImageDto.tags,
        transformations: [TransformationCategory.REFRAMED],
        width: targetWidth,
      });

    await this.imagesService.patch(ingredientData.id, {
      promptId: promptData.id,
    });

    const websocketUrl = WebSocketPaths.image(ingredientData.id);
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: parent.brandId ?? user.brandId,
        entityId: ingredientData.id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_REFRAME_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.IMAGE_REFRAME,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          ingredientId: ingredientData.id.toString(),
          model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
          sourceId: parent.id.toString(),
          type: 'transformation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Image Reframe',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData.id.toString(),
      userId: user.id,
    });

    url = 'ReplicateService reframeImage';
    await this.dispatchReframe({
      createImageDto,
      ingredientData,
      metadataId: metadataData.id,
      parentId: String(parent.id),
      promptData,
      request,
      targetHeight,
      targetWidth,
      url,
      user,
      websocketUrl,
    });

    return ingredientData;
  }

  private async dispatchReframe(params: {
    createImageDto: CreateImageDto;
    ingredientData: IngredientDocument;
    metadataId: string;
    parentId: string;
    promptData: Awaited<ReturnType<PromptsService['create']>>;
    request: Request;
    targetHeight: number;
    targetWidth: number;
    url: string;
    user: User;
    websocketUrl: string;
  }): Promise<void> {
    const {
      createImageDto,
      ingredientData,
      metadataId,
      parentId,
      promptData,
      request,
      targetHeight,
      targetWidth,
      url,
      user,
      websocketUrl,
    } = params;
    try {
      const parentImageUrl: string = `${this.configService.ingredientsEndpoint}/images/${parentId}`;
      const promptResult = await this.promptBuilderService.buildPrompt(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        {
          brand:
            ingredientData.brand &&
            typeof ingredientData.brand === 'object' &&
            'label' in ingredientData.brand &&
            typeof ingredientData.brand.label === 'string'
              ? {
                  description:
                    typeof ingredientData.brand.description === 'string'
                      ? ingredientData.brand.description
                      : undefined,
                  label: ingredientData.brand.label,
                }
              : undefined,
          height: targetHeight,
          modelCategory:
            ((request as unknown as { selectedModel?: { category?: string } })
              .selectedModel?.category as ModelCategory) ||
            ModelCategory.IMAGE_EDIT,
          prompt: promptData.original,
          references: [parentImageUrl],
          style: createImageDto.style,
          tags: createImageDto.tags?.map((tag) => tag.toString()) || [],
          width: targetWidth,
        },
        user.organizationId,
      );

      const generationId = await this.replicateService.generateTextToImage(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        promptResult.input,
      );

      if (generationId) {
        await this.metadataService.patch(
          metadataId,
          new MetadataEntity({
            externalId: generationId,
            promptId: promptData.id,
          }),
        );
      } else {
        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData.id,
          websocketUrl,
          user,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      const errorMessage = getErrorMessage(error);

      await this.failedGenerationService.handleFailedImageGeneration(
        this.imagesService,
        ingredientData.id,
        websocketUrl,
        user,
        getUserRoomName(user.id),
        errorMessage,
      );
    }
  }
}
