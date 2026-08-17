import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideoEditDto } from '@api/collections/videos/dto/video-edit.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
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
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
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
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
export class VideosUpscaleController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly filesClientService: FilesClientService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':videoId/upscale')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  // CreditsGuard prices via modelKey; CreditsInterceptor deducts on success only.
  // Manual deduct was removed to match lip-sync and avoid double-charging.
  @Credits({
    description: 'Video upscaling',
    modelKey: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
    source: ActivitySource.VIDEO_UPSCALE,
  })
  @UseInterceptors(CreditsInterceptor)
  @ValidateModel({ category: ModelCategory.VIDEO_EDIT })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async upscaleVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() videoEditDto: VideoEditDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const video = await this.videosService.findOne({
      id: videoId,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    // A presigned S3 URL, not the public stream route: the source video is
    // user- or organization-scoped, and that route now serves public assets
    // only. Same handoff `PortraitConversionService` uses for Replicate.
    const videoUrl = await this.filesClientService.getPresignedDownloadUrl(
      videoId,
      'videos',
    );
    // Hard-cap to a predictable cost tier (1080p @ 30fps) until dynamic pricing is added.
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
        await this.sharedService.createMediaDocuments(user, {
          brandId: video.brandId ?? user.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          model,
          organizationId: user.organizationId,
          parentId: videoId,
          status: IngredientStatus.PROCESSING,
          transformations: [TransformationCategory.UPSCALED],
        });

      await this.metadataService.patch(
        metadataData.id,
        new MetadataEntity({
          fps: targetFps,
          resolution: targetResolution,
        }),
      );

      // Create activity for video upscale start
      const activity = await this.activitiesService.create(
        new ActivityEntity({
          brandId: video.brandId ?? user.brandId,
          entityId: ingredientData.id,
          entityModel: ActivityEntityModel.INGREDIENT,
          key: ActivityKey.VIDEO_UPSCALE_PROCESSING,
          organizationId: user.organizationId,
          source: ActivitySource.VIDEO_UPSCALE,
          userId: user.userId ?? user.id,
          value: JSON.stringify({
            ingredientId: ingredientData.id.toString(),
            model,
            sourceId: videoId,
            type: 'transformation',
          }),
        }),
      );

      // Emit background-task-update WebSocket event for activities dropdown
      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity.id.toString(),
        label: 'Video Upscale',
        progress: 0,
        room: getUserRoomName(user.id),
        status: 'processing',
        taskId: ingredientData.id.toString(),
        userId: user.id,
      });

      if (this.configService.isDevelopment) {
        setTimeout(() => {
          const websocketUrl = `/${ingredientData.type}s/${ingredientData.id}`;
          void this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_REVERSED,
              id: ingredientData.id,
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

      const ingredientId = String(ingredientData.id);
      const websocketUrl = WebSocketPaths.video(ingredientId);

      if (externalId) {
        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: externalId,
          }),
        );

        // Credits are deducted by CreditsInterceptor on successful response.
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
