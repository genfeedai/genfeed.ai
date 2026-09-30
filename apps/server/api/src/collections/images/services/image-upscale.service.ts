import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { RequestWithSelectedModel } from '@api/helpers/guards/models/request-with-selected-model.interface';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  TransformationCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const LEGACY_CONTROLLER_NAME = 'ImagesTransformationsController';

@Injectable()
export class ImageUpscaleService {
  constructor(
    private readonly activityRecorder: ActivityRecorderService,
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
    private readonly generationBilling: GenerationBillingService,
  ) {}

  async upscaleImage(
    request: RequestWithSelectedModel,
    imageId: string,
    user: User,
    imageEditDto: ImageEditDto,
  ): Promise<IngredientDocument> {
    const url = `${LEGACY_CONTROLLER_NAME} upscaleImage`;
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

    const activity = await this.activityRecorder.record({
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
    });

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Image Upscale',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData.id.toString(),
      userId: user.id,
    });

    await this.dispatchUpscale(
      request,
      user,
      imageEditDto,
      imageUrl,
      ingredientData,
      metadataData.id,
    );
    return ingredientData;
  }

  private async dispatchUpscale(
    request: RequestWithSelectedModel,
    user: User,
    imageEditDto: ImageEditDto,
    imageUrl: string,
    ingredientData: IngredientDocument,
    metadataId: string,
  ): Promise<void> {
    const websocketUrl = `/images/${ingredientData.id}`;
    const url = `${LEGACY_CONTROLLER_NAME} upscaleImage`;

    let acceptedExternalId: string | undefined;
    try {
      const promptResult = await this.promptBuilderService.buildPrompt(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        {
          modelCategory:
            (request.selectedModel?.category as ModelCategory) ||
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

      const billingRequest = request as unknown as GenerationBillingRequest;
      const credits = billingRequest.creditsConfig?.amount;
      if (credits !== undefined)
        await this.generationBilling.bindOutput(billingRequest, {
          credits,
          ingredientId: String(ingredientData.id),
        });
      const generationId = await this.replicateService.runModel(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        promptResult.input,
      );

      if (generationId) {
        acceptedExternalId = generationId;
        await this.metadataService.patch(
          metadataId,
          new MetadataEntity({
            externalId: generationId,
          }),
        );
      } else {
        await this.generationBilling.releaseOutput(
          String(ingredientData.id),
          user.organizationId,
        );
        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData.id,
          websocketUrl,
          user,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      if (acceptedExternalId) {
        this.loggerService.error(
          'Accepted transformation metadata persistence failed',
          error,
        );
        try {
          await this.generationBilling.rememberAcceptedOutput({
            ingredientId: String(ingredientData.id),
            externalId: acceptedExternalId,
            organizationId: user.organizationId,
            userId: user.userId,
          });
        } catch (recoveryError: unknown) {
          this.loggerService.error(
            'Accepted transformation recovery failed; retain its funding',
            recoveryError,
            {
              ingredientId: String(ingredientData.id),
              externalId: acceptedExternalId,
            },
          );
        }
        return;
      }
      this.loggerService.error(`${url} failed`, error);
      const errorMessage = getErrorMessage(error);
      await this.generationBilling.releaseOutput(
        String(ingredientData.id),
        user.organizationId,
      );

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
