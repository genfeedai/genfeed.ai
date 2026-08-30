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
import { FILE_JOB_TYPES as JOB_TYPES } from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { CaptionsService } from '@server/collections/captions/services/captions.service';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import type { CreateMergedVideoDto } from '@server/collections/videos/dto/create-video.dto';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { requireVideoOutputPath } from '@server/collections/videos/utils/video-processing-result.util';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { WebSocketPaths } from '@server/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@server/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { WhisperService } from '@server/services/whisper/whisper.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import type { AggregatePaginateResult } from '@server/types/aggregate-paginate-result';

@Injectable()
export class VideoMergeOrchestrationService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly captionsService: CaptionsService,
    private readonly configService: ConfigService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly whisperService: WhisperService,
  ) {}

  async mergeVideos(
    user: User,
    createMergedVideoDto: CreateMergedVideoDto,
  ): Promise<IngredientDocument> {
    const ingredientIds = createMergedVideoDto.ids || [];
    const isCaptionsEnabled = createMergedVideoDto.isCaptionsEnabled || false;
    const isResizeEnabled = createMergedVideoDto.isResizeEnabled || false;
    const uniqueIds = [...new Set(createMergedVideoDto.ids)];

    const aggregate = {
      where: {
        id: { in: uniqueIds },
        category: IngredientCategory.VIDEO,
        status: {
          in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        },
        userId: user.userId ?? user.id,
      },
    };
    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, {
        customLabels,
        pagination: false,
      });

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
      await this.sharedService.createMediaDocuments(user, {
        brandId: user.brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        order: 1,
        organizationId: user.organizationId,
        sourceIds: parentIds,
        status: IngredientStatus.PROCESSING,
      });

    const ingredientId = String(ingredientData.id);
    const websocketURL = WebSocketPaths.video(ingredientId);
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: user.brandId,
        entityId: ingredientData.id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.WEB,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          frameCount: ingredientIds.length,
          ingredientId,
          label: `Merging ${ingredientIds.length} videos`,
          type: 'merge',
        }),
      }),
    );
    const activityId = activity.id.toString();

    this.fileQueueService
      .processVideo({
        ingredientId,
        organizationId: user.organizationId,
        params: {
          isMuteVideoAudio: createMergedVideoDto.isMuteVideoAudio,
          music: createMergedVideoDto.music
            ? String(createMergedVideoDto.music)
            : undefined,
          musicVolume:
            createMergedVideoDto.musicVolume !== undefined
              ? createMergedVideoDto.musicVolume / 100
              : undefined,
          sourceIds: ingredientIds,
          transition: createMergedVideoDto.transition,
          transitionDuration: createMergedVideoDto.transitionDuration,
          transitionEaseCurve: createMergedVideoDto.transitionEaseCurve,
          zoomConfigs: createMergedVideoDto.zoomConfigs,
          zoomEaseCurve: createMergedVideoDto.zoomEaseCurve,
        },
        room: getUserRoomName(user.id),
        type: JOB_TYPES.MERGE_VIDEOS,
        userId: user.userId ?? user.id,
        websocketUrl: websocketURL,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(
          job.jobId,
          300_000,
        );
        let output = requireVideoOutputPath(result.outputPath);

        if (isResizeEnabled) {
          const portraitJob = await this.fileQueueService.processVideo({
            ingredientId,
            organizationId: user.organizationId,
            params: {
              height: 1920,
              inputPath: `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`,
              width: 1080,
            },
            room: getUserRoomName(user.id),
            type: JOB_TYPES.CONVERT_TO_PORTRAIT,
            userId: user.userId ?? user.id,
            websocketUrl: `/videos/${ingredientId}`,
          });
          const result = await this.fileQueueService.waitForJob(
            portraitJob.jobId,
            180_000,
          );
          output = requireVideoOutputPath(result.outputPath);
        }

        await this.filesClientService.uploadToS3(ingredientId, 'videos', {
          path: output,
          type: FileInputType.FILE,
        });

        if (isCaptionsEnabled) {
          try {
            const captionContent = await this.whisperService.generateCaptions(
              ingredientData.id,
            );
            const captionInput = {
              content: null,
              format: CaptionFormat.SRT,
              ingredientId: ingredientData.id,
              isDeleted: false,
              language: CaptionLanguage.EN,
              organizationId: user.organizationId,
              userId: user.userId ?? user.id,
            };
            const caption = await this.captionsService.create(captionInput);
            const captionId = caption?.id;
            if (captionId) {
              await this.captionsService.patch(captionId, {
                content: captionContent,
              });
            }
            const captionsJob = await this.fileQueueService.processVideo({
              ingredientId,
              organizationId: user.organizationId,
              params: {
                captionContent,
                inputPath: `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`,
              },
              room: getUserRoomName(user.id),
              type: 'add-captions',
              userId: user.userId ?? user.id,
              websocketUrl: `/videos/${ingredientId}`,
            });
            const result = await this.fileQueueService.waitForJob(
              captionsJob.jobId,
              180_000,
            );
            output = requireVideoOutputPath(result.outputPath);
          } catch (error: unknown) {
            this.loggerService.error(
              `Failed to generate or add captions for merged video ${ingredientId}`,
              error,
            );
          }
        }

        const meta = await this.filesClientService.uploadToS3(
          ingredientData.id,
          'videos',
          {
            path: output,
            type: FileInputType.FILE,
          },
        );

        await this.metadataService.patch(metadataData.id, {
          duration: meta.duration,
          height: meta.height,
          size: meta.size,
          width: meta.width,
        });
        await this.ingredientsService.patch(ingredientData.id, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.MERGED],
        });
        await this.websocketService.publishVideoComplete(
          websocketURL,
          {
            eventType: WebSocketEventType.VIDEO_MERGED,
            id: ingredientData.id,
            status: WebSocketEventStatus.COMPLETED,
            transformation: TransformationCategory.MERGED,
          },
          user.id,
          getUserRoomName(user.id),
        );
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
        await this.ingredientsService.patch(ingredientData.id, {
          status: IngredientStatus.FAILED,
        });
        await this.websocketService.publishMediaFailed(
          websocketURL,
          `Failed to merge videos: ${errorMessage}`,
          user.id,
          getUserRoomName(user.id),
        );
        await this.activitiesService.patch(activityId, {
          key: ActivityKey.VIDEO_FAILED,
          value: JSON.stringify({
            error: errorMessage,
            frameCount: ingredientIds.length,
            ingredientId,
            label: 'Merge failed',
            type: 'merge',
          }),
        });
        await this.websocketService.publishBackgroundTaskUpdate({
          activityId,
          error: errorMessage,
          label: 'Merge failed',
          room: getUserRoomName(user.id),
          status: 'failed',
          taskId: ingredientId,
          userId: user.id,
        });
      });

    return ingredientData;
  }
}
