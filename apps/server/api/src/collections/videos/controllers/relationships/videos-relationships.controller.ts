/**
 * Videos Relationships Controller
 * Handles video relationship operations:
 * - Get video children (derived videos)
 * - Get video posts (published instances)
 * - Merge multiple videos into one
 */
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import type { Video } from '@api/collections/videos/schemas/video.schema';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import { JOB_TYPES } from '@files/queues/queue.constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CaptionFormat,
  CaptionLanguage,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import {
  IngredientSerializer,
  PostSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosRelationshipsController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly filesClientService: FilesClientService,
    private readonly captionsService: CaptionsService,
    private readonly configService: ConfigService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly postsService: PostsService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly whisperService: WhisperService,
  ) {}

  @Get(':videoId/children')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findChildren(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @Query() query: VideosQueryDto,
  ) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          parent: videoId,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':videoId/posts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllPosts(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<Video> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          ingredient: videoId,
          isDeleted,
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }

  @Post('merge')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async mergeVideos(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createMergedVideoDto: CreateMergedVideoDto,
  ) {
    const ingredientIds = createMergedVideoDto.ids || [];

    const isCaptionsEnabled = createMergedVideoDto.isCaptionsEnabled || false;
    const isResizeEnabled = createMergedVideoDto.isResizeEnabled || false;
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      pagination: false,
    };

    const uniqueIds = [...new Set(createMergedVideoDto.ids)];
    const uniqueObjectIds = uniqueIds.map((id: string) => id);

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          _id: { $in: uniqueObjectIds },
          category: IngredientCategory.VIDEO,
          status: {
            $in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
          user: publicMetadata.user,
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);

    if (data.docs.length !== uniqueIds.length) {
      throw new HttpException(
        {
          detail: `Found ${data.docs.length} of ${uniqueIds.length} videos with COMPLETED or VALIDATED status`,
          title: 'Videos not available',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const parentIds = ingredientIds.map((id: string) => id);

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: publicMetadata.brand,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        order: 1,
        organization: publicMetadata.organization,
        sources: parentIds,
        status: IngredientStatus.PROCESSING,
      });

    const ingredientId = (ingredientData._id as string).toHexString();
    const websocketURL = WebSocketPaths.video(ingredientId);

    // Create activity to track merge progress
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: publicMetadata.brand,
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.WEB,
        user: publicMetadata.user,
        value: JSON.stringify({
          frameCount: ingredientIds.length,
          ingredientId,
          label: `Merging ${ingredientIds.length} videos`,
          type: 'merge',
        }),
      }),
    );
    const activityId = activity._id.toString();

    // Queue merge videos operation
    this.fileQueueService
      .processVideo({
        clerkUserId: user.id,
        ingredientId,
        organizationId: publicMetadata.organization,
        params: {
          isMuteVideoAudio: createMergedVideoDto.isMuteVideoAudio,
          music: createMergedVideoDto.music
            ? String(createMergedVideoDto.music)
            : undefined,
          musicVolume:
            createMergedVideoDto.musicVolume !== undefined
              ? createMergedVideoDto.musicVolume / 100
              : undefined, // Convert 0-100 to 0-1 (0 = mute)
          sourceIds: ingredientIds,
          transition: createMergedVideoDto.transition,
          transitionDuration: createMergedVideoDto.transitionDuration,
          transitionEaseCurve: createMergedVideoDto.transitionEaseCurve,
          zoomConfigs: createMergedVideoDto.zoomConfigs,
          zoomEaseCurve: createMergedVideoDto.zoomEaseCurve,
        },
        room: getUserRoomName(user.id),
        type: JOB_TYPES.MERGE_VIDEOS,
        userId: publicMetadata.user,
        websocketUrl: websocketURL,
      })
      .then(async (job) => {
        // Merging videos can take longer, increase timeout to 5 minutes
        const result = await this.fileQueueService.waitForJob(
          job.jobId,
          300_000,
        );
        let output = result.outputPath;

        if (isResizeEnabled) {
          // Queue portrait conversion in files.genfeed service
          const portraitJob = await this.fileQueueService.processVideo({
            clerkUserId: user.id,
            ingredientId,
            organizationId: publicMetadata.organization,
            params: {
              height: 1920,
              inputPath: `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`,
              width: 1080,
            },
            room: getUserRoomName(user.id),
            type: JOB_TYPES.CONVERT_TO_PORTRAIT,
            userId: publicMetadata.user,
            websocketUrl: `/videos/${ingredientId}`,
          });
          const result = await this.fileQueueService.waitForJob(
            portraitJob.jobId,
            180000, // 3 minutes for portrait conversion
          );
          output = result.outputPath;
        }

        // Upload to S3 the first version of the video
        // Useful to download the video for the captions generation
        await this.filesClientService.uploadToS3(ingredientId, `videos`, {
          path: output,
          type: FileInputType.FILE,
        });

        if (isCaptionsEnabled) {
          try {
            const captionContent = await this.whisperService.generateCaptions(
              ingredientData.id,
            );

            const caption = await this.captionsService.create(
              new CaptionEntity({
                ...createMergedVideoDto,
                content: captionContent,
                format: CaptionFormat.SRT,
                ingredient: ingredientData.id,
                isDeleted: false,
                language: CaptionLanguage.EN,
                user: publicMetadata.user,
              }),
            );

            // Queue captions addition in files.genfeed service
            const captionsJob = await this.fileQueueService.processVideo({
              clerkUserId: user.id,
              ingredientId,
              organizationId: publicMetadata.organization,
              params: {
                captionContent: caption.content,
                inputPath: `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`,
              },
              room: getUserRoomName(user.id),
              type: 'add-captions',
              userId: publicMetadata.user,
              websocketUrl: `/videos/${ingredientId}`,
            });

            // Wait for the captions job to complete
            const result = await this.fileQueueService.waitForJob(
              captionsJob.jobId,
              180000, // 3 minutes for adding captions
            );
            output = result.outputPath;
          } catch (error: unknown) {
            this.loggerService.error(
              `Failed to generate or add captions for merged video ${ingredientId}`,
              error,
            );
            // Continue without captions rather than failing the entire merge
            // The merged video without captions is still usable
          }
        }

        const meta = await this.filesClientService.uploadToS3(
          ingredientData._id,
          `videos`,
          {
            path: output,
            type: FileInputType.FILE,
          },
        );

        await this.metadataService.patch(metadataData._id, {
          duration: meta.duration,
          height: meta.height,
          size: meta.size,
          width: meta.width,
        });

        await this.ingredientsService.patch(ingredientData._id, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.MERGED],
        });

        // Emit WebSocket event to notify frontend
        await this.websocketService.publishVideoComplete(
          websocketURL,
          {
            eventType: WebSocketEventType.VIDEO_MERGED,
            id: ingredientData._id,
            status: WebSocketEventStatus.COMPLETED,
            transformation: TransformationCategory.MERGED,
          },
          user.id,
          getUserRoomName(user.id),
        );

        // Update activity to completed with resultId
        await this.activitiesService.patch(activityId, {
          key: ActivityKey.VIDEO_COMPLETED,
          value: JSON.stringify({
            frameCount: ingredientIds.length,
            ingredientId,
            label: `Merged ${ingredientIds.length} videos`,
            progress: 100,
            resultId: ingredientId,
            resultType: 'VIDEO',
            type: 'merge',
          }),
        });

        // Emit background-task-update WebSocket event for activities dropdown
        await this.websocketService.publishBackgroundTaskUpdate({
          activityId,
          label: `Merged ${ingredientIds.length} videos`,
          progress: 100,
          resultId: ingredientId,
          resultType: 'VIDEO',
          room: getUserRoomName(user.id),
          status: 'completed',
          taskId: ingredientId,
          userId: user.id,
        });

        return output;
      })
      .catch(async (error: unknown) => {
        const errorMessage =
          (error as Error)?.message ?? 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.loggerService.error(`${websocketURL} mergeVideos failed`, {
          error: errorMessage,
          ingredientId,
          stack: errorStack,
        });

        // Update ingredient status to failed
        await this.ingredientsService.patch(ingredientData._id, {
          status: IngredientStatus.FAILED,
        });

        // Emit failure event
        await this.websocketService.publishMediaFailed(
          websocketURL,
          `Failed to merge videos: ${errorMessage}`,
          user.id,
          getUserRoomName(user.id),
        );

        // Update activity to failed
        await this.activitiesService.patch(activityId, {
          key: ActivityKey.VIDEO_FAILED,
          value: JSON.stringify({
            error: errorMessage,
            frameCount: ingredientIds.length,
            ingredientId,
            label: `Merge failed`,
            type: 'merge',
          }),
        });

        // Emit background-task-update WebSocket event for activities dropdown
        await this.websocketService.publishBackgroundTaskUpdate({
          activityId,
          error: errorMessage,
          label: `Merge failed`,
          room: getUserRoomName(user.id),
          status: 'failed',
          taskId: ingredientId,
          userId: user.id,
        });
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
