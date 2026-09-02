import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  TransformationCategory,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const LEGACY_CONTROLLER_NAME = 'ImagesTransformationsController';

@Injectable()
export class ImageUpscaleService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async upscaleImage(
    request: Request,
    imageId: string,
    user: User,
    imageEditDto: ImageEditDto,
  ): Promise<IngredientDocument> {
    let url = `${LEGACY_CONTROLLER_NAME} upscaleImage`;
    this.loggerService.log(url, { body: imageEditDto, params: { imageId } });

    const parent = await this.imagesService.findOne(
      {
        id: imageId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
        ],
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
      },
      [PopulatePatterns.metadataFull],
    );

    if (!parent) {
      throw new HttpException(
        {
          detail: 'Parent image is required',
          title: 'Invalid parent ingredient',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const imageUrl = `${this.configService.ingredientsEndpoint}/images/${imageId}`;

    const model =
      imageEditDto.model ||
      ((await this.routerService.getDefaultModel(
        ModelCategory.IMAGE_UPSCALE,
      )) as string);

    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        brandId: parent.brandId ?? undefined,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        extension: imageEditDto.outputFormat || MetadataExtension.JPG,
        model,
        organizationId: parent.organizationId ?? undefined,
        parentId: parent.id,
        status: IngredientStatus.PROCESSING,
        transformations: [TransformationCategory.UPSCALED],
      });

    const websocketUrl = `/images/${ingredientData.id}`;

    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: parent.brandId ?? user.brandId,
        entityId: ingredientData.id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_UPSCALE_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.IMAGE_UPSCALE,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          ingredientId: ingredientData.id.toString(),
          model,
          sourceId: parent.id.toString(),
          type: 'transformation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Image Upscale',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData.id.toString(),
      userId: user.id,
    });

    url = `${LEGACY_CONTROLLER_NAME} upscaleImage`;

    try {
      const promptResult = await this.promptBuilderService.buildPrompt(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        {
          modelCategory:
            ((request as unknown as { selectedModel?: { category?: string } })
              .selectedModel?.category as ModelCategory) ||
            ModelCategory.IMAGE_UPSCALE,
          prompt: '',
          references: [imageUrl],
          ...({
            enhance_model: imageEditDto.enhanceModel || 'Low Resolution V2',
            face_enhancement: imageEditDto.faceEnhancement !== false,
            face_enhancement_creativity:
              imageEditDto.faceEnhancementCreativity || 0.5,
            face_enhancement_strength:
              imageEditDto.faceEnhancementStrength || 0.8,
            output_format: imageEditDto.outputFormat || 'jpg',
            subject_detection: imageEditDto.subjectDetection || 'Foreground',
            upscale_factor: imageEditDto.upscaleFactor || '4x',
          } as Record<string, unknown>),
        },
        user.organizationId,
      );

      const generationId = await this.replicateService.runModel(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        promptResult.input,
      );

      if (generationId) {
        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: generationId,
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

    return ingredientData;
  }
}
