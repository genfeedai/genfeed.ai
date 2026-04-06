import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { ConfigService } from '@api/config/config.service';
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
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
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
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
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
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, Types } from 'mongoose';

@AutoSwagger()
@Controller('videos')
export class VideosReframeController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelsService: ModelsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':videoId/reframe')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @Credits({
    description: 'Video reframe',
    modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
    source: ActivitySource.VIDEO_REFRAME,
  })
  @ValidateModel({ category: ModelCategory.VIDEO_EDIT })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async reframeVideo(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Body() createVideoDto: CreateVideoDto,
  ): Promise<JsonApiSingleResponse> {
    let url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const publicMetadata = getPublicMetadata(user);
    const parent = await this.videosService.findOne(
      {
        _id: new Types.ObjectId(videoId),
        category: IngredientCategory.VIDEO,
        user: new Types.ObjectId(publicMetadata.user),
      },
      [PopulatePatterns.metadataFull],
    );

    if (!parent) {
      throw new HttpException(
        {
          detail: 'Parent video not found',
          title: 'Invalid parent ingredient',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const parentMetadata = parent.metadata as unknown as MetadataEntity;
    const format = createVideoDto.format || 'landscape';
    let targetWidth = createVideoDto.width;
    let targetHeight = createVideoDto.height;

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

    // Hard-cap dimensions to a predictable cost tier until dynamic pricing is added.
    const maxLandscape = { height: 1080, width: 1920 };
    const maxPortrait = { height: 1920, width: 1080 };
    const maxSquare = { height: 1080, width: 1080 };

    if (format === 'square') {
      targetWidth = Math.min(targetWidth, maxSquare.width);
      targetHeight = Math.min(targetHeight, maxSquare.height);
    } else if (format === 'portrait') {
      targetWidth = Math.min(targetWidth, maxPortrait.width);
      targetHeight = Math.min(targetHeight, maxPortrait.height);
    } else {
      targetWidth = Math.min(targetWidth, maxLandscape.width);
      targetHeight = Math.min(targetHeight, maxLandscape.height);
    }

    const promptText =
      createVideoDto.text ||
      createVideoDto.prompt ||
      `Reframe video to ${format} format`;

    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: isValidObjectId(parent.brand)
          ? new Types.ObjectId(parent.brand)
          : new Types.ObjectId(publicMetadata.brand),
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        organization: new Types.ObjectId(publicMetadata.organization),
        original:
          typeof promptText === 'string'
            ? promptText
            : promptText?.toString() || '',
        status: PromptStatus.PROCESSING,
        user: new Types.ObjectId(publicMetadata.user),
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createVideoDto,
        brand: isValidObjectId(parent.brand)
          ? new Types.ObjectId(parent.brand)
          : new Types.ObjectId(publicMetadata.brand),
        category: IngredientCategory.VIDEO,
        duration: parentMetadata.duration,
        extension: MetadataExtension.MP4,
        height: targetHeight,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        organization: isValidObjectId(parent.organization)
          ? new Types.ObjectId(parent.organization)
          : new Types.ObjectId(publicMetadata.organization),
        parent: parent._id,
        prompt: new Types.ObjectId(promptData._id),
        status: IngredientStatus.PROCESSING,
        transformations: [TransformationCategory.REFRAMED],
        width: targetWidth,
      });

    await this.videosService.patch(ingredientData._id, {
      prompt: new Types.ObjectId(promptData._id),
    });

    const websocketUrl = WebSocketPaths.video(ingredientData._id);

    // Create activity for video reframe start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: isValidObjectId(parent.brand)
          ? new Types.ObjectId(parent.brand)
          : new Types.ObjectId(publicMetadata.brand),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_REFRAME_PROCESSING,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.VIDEO_REFRAME,
        user: new Types.ObjectId(publicMetadata.user),
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
          sourceId: parent._id.toString(),
          type: 'transformation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Video Reframe',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    url = 'ReplicateService reframeVideo';
    try {
      const parentId = String(parent?._id);
      const parentVideoUrl = `${this.configService.ingredientsEndpoint}/videos/${parentId}`;

      const { input: promptParams } =
        await this.promptBuilderService.buildPrompt(
          MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
          {
            brand: ingredientData.brand,
            camera: createVideoDto.camera,
            height: targetHeight,
            modelCategory:
              ((request as unknown as { selectedModel?: { category?: string } })
                .selectedModel?.category as ModelCategory) ||
              ModelCategory.VIDEO_EDIT,
            mood: createVideoDto.mood,
            prompt: promptData.original,
            references: [parentVideoUrl],
            scene: createVideoDto.scene,
            style: createVideoDto.style,
            tags: createVideoDto.tags?.map((tag) => tag.toString()),
            width: targetWidth,
          },
        );

      const generationId = await this.replicateService.generateTextToVideo(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        promptParams,
      );

      if (generationId) {
        const modelData = await this.modelsService.findOne({
          key: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        });
        const creditsToDeduct = modelData?.cost || 10;

        if (creditsToDeduct > 0) {
          await this.creditsUtilsService.deductCreditsFromOrganization(
            publicMetadata.organization,
            publicMetadata.user,
            creditsToDeduct,
            `Video reframe - ${MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO}`,
            ActivitySource.VIDEO_REFRAME,
          );

          this.loggerService.log('Credits deducted after video reframe', {
            credits: creditsToDeduct,
            generationId,
            model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
            organizationId: publicMetadata.organization,
            userId: publicMetadata.user,
          });
        }

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: generationId,
            prompt: new Types.ObjectId(promptData._id),
          }),
        );
      } else {
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientData._id,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      await this.failedGenerationService.handleFailedVideoGeneration(
        this.videosService,
        ingredientData._id,
        websocketUrl,
        user.id,
        getUserRoomName(user.id),
      );
    }

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
