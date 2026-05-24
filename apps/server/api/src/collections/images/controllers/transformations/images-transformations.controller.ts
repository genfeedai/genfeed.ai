/**
 * Images Transformations Controller
 * Handles all image transformation operations:
 * - Resize: Change image dimensions
 * - Reframe: Adjust image framing/composition
 * - Upscale: Enhance image resolution and quality
 */
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { ConfigService } from '@api/config/config.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import {
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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
import type {
  IResizeBodyParams,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * ImagesTransformationsController
 * Handles image transformation operations
 * All transformations create new image ingredients with appropriate metadata
 */
@AutoSwagger()
@Controller('images')
@UseInterceptors(CreditsInterceptor)
export class ImagesTransformationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly fileQueueService: FileQueueService,
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    readonly _modelsService: ModelsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':imageId/resize')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resizeImage(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('imageId') imageId: string,
    @Body() body: IResizeBodyParams,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const image = await this.imagesService.findOne({
      _id: imageId,
      user: publicMetadata.user,
    });

    if (!image) {
      return returnNotFound(this.constructorName, imageId);
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: publicMetadata.brand,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          organization: publicMetadata.organization,
          parent: imageId,
          status: IngredientStatus.PROCESSING,
        });

      // Queue image resize operation in files.genfeed service
      const resizeJob = await this.fileQueueService.processImage({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: publicMetadata.organization,
        params: {
          height: body.height || 1920,
          sourceId: imageId,
          width: body.width || 1080,
        },
        room: getUserRoomName(user.id),
        type: 'resize',
        userId: publicMetadata.user,
      });

      // Wait for the resize operation to complete
      this.fileQueueService
        .waitForJob(resizeJob.jobId, 30_000)
        .then(async (result: unknown) => {
          // The resize operation in files.genfeed should handle S3 upload
          // Update metadata with the result from the job
          const meta =
            (result as { metadata?: Record<string, unknown> }).metadata || {};

          await this.metadataService.patch(metadataData._id, {
            height: meta.height,
            size: meta.size,
            width: meta.width,
          });

          await this.imagesService.patch(ingredientData._id, {
            status: IngredientStatus.GENERATED,
            transformations: [TransformationCategory.RESIZED],
          });

          // Cleanup is handled by files.genfeed service
        })
        .catch((error: unknown) => {
          this.loggerService.error(`${url} resizeImage failed`, error);
        });

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post(':imageId/reframe')
  @RateLimit(RateLimitPresets.external) // 30 requests per minute for AI generation
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @Credits({
    description: 'Image reframe',
    modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
    source: ActivitySource.IMAGE_REFRAME,
  })
  @ValidateModel({ category: ModelCategory.IMAGE_EDIT })
  async reframeImage(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Body() createImageDto: CreateImageDto,
  ): Promise<JsonApiSingleResponse> {
    let url = `${this.constructorName} reframeImage`;
    this.loggerService.log(url, { body: createImageDto, params: { imageId } });

    const publicMetadata = getPublicMetadata(user);

    const parent = await this.imagesService.findOne(
      {
        _id: imageId,
        category: IngredientCategory.IMAGE,
        user: publicMetadata.user,
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

    // Determine target dimensions - use provided dimensions or defaults based on format
    const format = createImageDto.format || 'landscape';
    let targetWidth = createImageDto.width;
    let targetHeight = createImageDto.height;

    // If dimensions not provided, use defaults based on format
    if (!targetWidth || !targetHeight) {
      if (format === 'square') {
        targetWidth = 1080;
        targetHeight = 1080;
      } else if (format === 'portrait') {
        targetWidth = 1080;
        targetHeight = 1920;
      } else {
        // landscape or default
        targetWidth = 1920;
        targetHeight = 1080;
      }
    }

    // Create prompt for reframing - use text field from body
    const promptText =
      createImageDto.text ||
      createImageDto.prompt ||
      `Reframe image to ${format} format`;
    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: isEntityId(parent.brand) ? parent.brand : publicMetadata.brand,
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        organization: publicMetadata.organization,
        original:
          typeof promptText === 'string'
            ? promptText
            : String(promptText ?? ''),
        status: PromptStatus.PROCESSING,
        user: publicMetadata.user,
      }),
    );

    // Create new ingredient for reframed image
    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createImageDto,
        brand: isEntityId(parent.brand) ? parent.brand : publicMetadata.brand,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPEG,
        height: targetHeight,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        organization: isEntityId(parent.organization)
          ? parent.organization
          : publicMetadata.organization,
        parent: parent._id,
        prompt: promptData._id,
        status: IngredientStatus.PROCESSING,
        transformations: [TransformationCategory.REFRAMED],
        width: targetWidth,
      });

    await this.imagesService.patch(ingredientData._id, {
      prompt: promptData._id,
    });

    const websocketUrl = WebSocketPaths.image(ingredientData._id);

    // Create activity for image reframe start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: isEntityId(parent.brand) ? parent.brand : publicMetadata.brand,
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_REFRAME_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.IMAGE_REFRAME,
        user: publicMetadata.user,
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
          sourceId: parent._id.toString(),
          type: 'transformation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Image Reframe',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    // Process reframing with Replicate/Luma
    url = 'ReplicateService reframeImage';
    try {
      const parentId = String(parent?._id);
      const parentImageUrl: string = `${this.configService.ingredientsEndpoint}/images/${parentId}`;

      // Build provider-specific prompt using universal prompt builder
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
        publicMetadata.organization,
      );

      const generationId = await this.replicateService.generateTextToImage(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        promptResult.input,
      );

      if (generationId) {
        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: generationId,
            prompt: promptData._id,
          }),
        );
      } else {
        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData._id,
          websocketUrl,
          publicMetadata,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      const errorMessage = getErrorMessage(error);

      await this.failedGenerationService.handleFailedImageGeneration(
        this.imagesService,
        ingredientData._id,
        websocketUrl,
        publicMetadata,
        getUserRoomName(user.id),
        errorMessage,
      );
    }

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  @Post(':imageId/upscale')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @Credits({
    description: 'Image upscaling',
    modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
    source: ActivitySource.IMAGE_UPSCALE,
  })
  @ValidateModel({ category: ModelCategory.IMAGE_EDIT })
  async upscaleImage(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Body() imageEditDto: ImageEditDto,
  ): Promise<JsonApiSingleResponse> {
    let url = `${this.constructorName} upscaleImage`;
    this.loggerService.log(url, { body: imageEditDto, params: { imageId } });

    const publicMetadata = getPublicMetadata(user);

    const parent = await this.imagesService.findOne(
      {
        _id: imageId,
        OR: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
        category: IngredientCategory.IMAGE,
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

    // const parentMetadata = parent.metadata  as Metadata;
    const imageUrl = `${this.configService.ingredientsEndpoint}/images/${imageId}`;

    // Model selection: user-provided > system default
    const model =
      imageEditDto.model ||
      ((await this.routerService.getDefaultModel(
        ModelCategory.IMAGE_UPSCALE,
      )) as string);

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...imageEditDto,
        brand: isEntityId(parent.brand) ? parent.brand : null,
        category: IngredientCategory.IMAGE,
        extension: imageEditDto.outputFormat || 'jpg',
        model,
        organization: isEntityId(parent.organization)
          ? parent.organization
          : null,
        parent: parent._id,
        status: IngredientStatus.PROCESSING,
        transformations: [TransformationCategory.UPSCALED],
      });

    const websocketUrl = `/images/${ingredientData._id}`;

    // Create activity for image upscale start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: isEntityId(parent.brand) ? parent.brand : publicMetadata.brand,
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_UPSCALE_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.IMAGE_UPSCALE,
        user: publicMetadata.user,
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          model,
          sourceId: parent._id.toString(),
          type: 'transformation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Image Upscale',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    url = `${this.constructorName} upscaleImage`;

    try {
      // Build provider-specific input using universal prompt builder
      // Note: Topaz Image Upscale doesn't use a prompt, but we pass empty string for consistency
      const promptResult = await this.promptBuilderService.buildPrompt(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        {
          modelCategory:
            ((request as unknown as { selectedModel?: { category?: string } })
              .selectedModel?.category as ModelCategory) ||
            ModelCategory.IMAGE_UPSCALE,
          prompt: '', // Topaz Image Upscale doesn't use prompts
          references: [imageUrl],
          // Pass Topaz-specific fields through params
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
        publicMetadata.organization,
      );

      const generationId = await this.replicateService.runModel(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        promptResult.input,
      );

      if (generationId) {
        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: generationId,
          }),
        );
      } else {
        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData._id,
          websocketUrl,
          publicMetadata,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      const errorMessage = getErrorMessage(error);

      await this.failedGenerationService.handleFailedImageGeneration(
        this.imagesService,
        ingredientData._id,
        websocketUrl,
        publicMetadata,
        getUserRoomName(user.id),
        errorMessage,
      );
    }

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
