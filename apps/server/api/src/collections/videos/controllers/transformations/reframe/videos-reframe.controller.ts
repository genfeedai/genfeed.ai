import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { MetadataEntity } from '@server/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { PromptEntity } from '@server/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@server/collections/prompts/services/prompts.service';
import { CreateVideoDto } from '@server/collections/videos/dto/create-video.dto';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@server/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@server/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@server/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
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
import { ConfigService } from '@libs/config/config.service';
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
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
export class VideosReframeController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':videoId/reframe')
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  // CreditsGuard prices via modelKey; CreditsInterceptor deducts on success only.
  // Manual deduct was removed to match lip-sync and avoid double-charging.
  @Credits({
    description: 'Video reframe',
    modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
    source: ActivitySource.VIDEO_REFRAME,
  })
  @UseInterceptors(CreditsInterceptor)
  @ValidateModel({ category: ModelCategory.VIDEO_EDIT })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async reframeVideo(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Body() createVideoDto: CreateVideoDto,
  ): Promise<JsonApiSingleResponse> {
    let url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const parent = await this.videosService.findOne(
      {
        id: videoId,
        category: IngredientCategory.VIDEO,
        userId: user.userId ?? user.id,
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
      createVideoDto.text || `Reframe video to ${format} format`;

    const promptData = await this.promptsService.create(
      new PromptEntity({
        brandId: parent.brandId ?? user.brandId,
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
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
        category: IngredientCategory.VIDEO,
        duration: parentMetadata.duration,
        extension: MetadataExtension.MP4,
        generationPrompt: promptData.original,
        generationSeed: createVideoDto.seed,
        height: targetHeight,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        negativePrompt: createVideoDto.negativePrompt,
        organizationId: parent.organizationId ?? user.organizationId,
        parentId: parent.id,
        promptId: promptData.id,
        scope: createVideoDto.scope,
        sourceIds: createVideoDto.references,
        status: IngredientStatus.PROCESSING,
        tagIds: createVideoDto.tags,
        transformations: [TransformationCategory.REFRAMED],
        width: targetWidth,
      });

    await this.videosService.patch(ingredientData.id, {
      promptId: promptData.id,
    });

    const websocketUrl = WebSocketPaths.video(ingredientData.id);

    // Create activity for video reframe start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: parent.brandId ?? user.brandId,
        entityId: ingredientData.id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_REFRAME_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.VIDEO_REFRAME,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          ingredientId: ingredientData.id.toString(),
          model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
          sourceId: parent.id.toString(),
          type: 'transformation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Video Reframe',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData.id.toString(),
      userId: user.id,
    });

    url = 'ReplicateService reframeVideo';
    try {
      const parentId = String(parent?.id);
      const parentVideoUrl = `${this.configService.ingredientsEndpoint}/videos/${parentId}`;

      const { input: promptParams } =
        await this.promptBuilderService.buildPrompt(
          MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
          {
            brand:
              typeof ingredientData.brand === 'object' &&
              ingredientData.brand !== null &&
              !Array.isArray(ingredientData.brand) &&
              typeof (ingredientData.brand as { label?: unknown }).label ===
                'string'
                ? {
                    description:
                      typeof (ingredientData.brand as { description?: unknown })
                        .description === 'string'
                        ? (
                            ingredientData.brand as unknown as {
                              description: string;
                            }
                          ).description
                        : undefined,
                    label: (
                      ingredientData.brand as unknown as { label: string }
                    ).label,
                  }
                : undefined,
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
        // Credits are deducted by CreditsInterceptor on successful response.

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity({
            externalId: generationId,
            promptId: promptData.id,
          }),
        );
      } else {
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientData.id,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      await this.failedGenerationService.handleFailedVideoGeneration(
        this.videosService,
        ingredientData.id,
        websocketUrl,
        user.id,
        getUserRoomName(user.id),
      );
    }

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
