import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
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
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
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
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
export class VideosUpscaleController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelsService: ModelsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':videoId/upscale')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @Credits({
    description: 'Video upscaling',
    modelKey: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
    source: ActivitySource.VIDEO_UPSCALE,
  })
  @ValidateModel({ category: ModelCategory.VIDEO_EDIT })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async upscaleVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() videoEditDto: VideoEditDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      $or: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const videoUrl = `${this.configService.get('GENFEEDAI_API_URL')}/v1/public/videos/${videoId}/video.mp4`;
    // Hard-cap to a predictable cost tier (1080p @ 30fps) until dynamic pricing is added.
    // const targetFps = videoEditDto.targetFps || 60;
    // const targetResolution = videoEditDto.targetResolution || '4k';
    const targetFps = 30;
    const targetResolution = '1080p';

    // Model selection: user-provided > system default
    const model =
      videoEditDto.model ||
      ((await this.routerService.getDefaultModel(
        ModelCategory.VIDEO_UPSCALE,
      )) as string);

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: video.brand || publicMetadata.brand,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          model,
          organization: publicMetadata.organization,
          parent: videoId,
          status: IngredientStatus.PROCESSING,
          transformations: [TransformationCategory.UPSCALED],
        });

      await this.metadataService.patch(
        metadataData._id,
        new MetadataEntity({
          fps: targetFps,
          resolution: targetResolution,
        }),
      );

      // Create activity for video upscale start
      const activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: video.brand || publicMetadata.brand,
          entityId: ingredientData._id,
          entityModel: ActivityEntityModel.INGREDIENT,
          key: ActivityKey.VIDEO_UPSCALE_PROCESSING,
          organization: publicMetadata.organization,
          source: ActivitySource.VIDEO_UPSCALE,
          user: publicMetadata.user,
          value: JSON.stringify({
            ingredientId: ingredientData._id.toString(),
            model,
            sourceId: videoId,
            type: 'transformation',
          }),
        }),
      );

      // Emit background-task-update WebSocket event for activities dropdown
      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity._id.toString(),
        label: 'Video Upscale',
        progress: 0,
        room: getUserRoomName(user.id),
        status: 'processing',
        taskId: ingredientData._id.toString(),
        userId: user.id,
      });

      if (this.configService.isDevelopment) {
        setTimeout(() => {
          const websocketUrl = `/${ingredientData.type}s/${ingredientData._id}`;
          void this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_REVERSED,
              id: ingredientData._id,
              status: WebSocketEventStatus.COMPLETED,
            },
            user.id,
            getUserRoomName(user.id),
          );
        }, 2_000);

        return serializeSingle(request, IngredientSerializer, ingredientData);
      }

      const { input: promptParams } =
        await this.promptBuilderService.buildPrompt(
          MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
          {
            modelCategory:
              ((request as unknown as { selectedModel?: { category?: string } })
                .selectedModel?.category as ModelCategory) ||
              ModelCategory.VIDEO_UPSCALE,
            prompt: 'Video upscaling',
            target_fps: targetFps,
            target_resolution: targetResolution,
            video: videoUrl,
          },
        );

      const externalId = await this.replicateService.runModel(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        promptParams,
      );

      const ingredientId = String(ingredientData._id);
      const websocketUrl = WebSocketPaths.video(ingredientId);

      if (externalId) {
        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: externalId,
          }),
        );

        const modelData = await this.modelsService.findOne({
          key: model,
        });

        const creditsToDeduct = modelData?.cost || 0;

        if (creditsToDeduct > 0) {
          await this.creditsUtilsService.deductCreditsFromOrganization(
            publicMetadata.organization,
            publicMetadata.user,
            creditsToDeduct,
            `Video upscaling - ${MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE}`,
            ActivitySource.VIDEO_UPSCALE,
          );
        }
      } else {
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientId,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
        );
      }

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
