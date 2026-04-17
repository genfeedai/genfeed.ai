import fs from 'node:fs';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
export class VideosEffectsController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post(':videoId/reverse')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async reverseVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      user: publicMetadata.user,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        brand: video.brand || video.brand,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organization: video.organization,
        parent: videoId,
        status: IngredientStatus.PROCESSING,
      });

    const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
    this.fileQueueService
      .processVideo({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: publicMetadata.organization,
        params: {
          inputPath: videoUrl,
        },
        room: getUserRoomName(user.id),
        type: 'reverse-video',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientData._id}`,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(job.jobId, 60000);
        const output = result.outputPath;
        const meta = await this.filesClientService.uploadToS3(
          ingredientData._id,
          `videos`,
          { path: output, type: FileInputType.FILE },
        );

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity(meta),
        );
        await this.ingredientsService.patch(
          ingredientData._id,
          new IngredientEntity({
            status: IngredientStatus.GENERATED,
            transformations: [TransformationCategory.REVERSED],
          }),
        );

        const websocketUrl = WebSocketPaths.video(ingredientData._id);
        await this.websocketService.publishVideoComplete(
          websocketUrl,
          {
            eventType: WebSocketEventType.VIDEO_REVERSED,
            id: ingredientData._id,
            status: WebSocketEventStatus.COMPLETED,
          },
          user.id,
          getUserRoomName(user.id),
        );
      })
      .catch((error: unknown) => {
        this.loggerService.error(`${url} failed`, error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  @Post(':videoId/mirror')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async mirrorVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      user: publicMetadata.user,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: video.brand || video.brand,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organization: video.organization,
          parent: videoId,
          status: IngredientStatus.PROCESSING,
        });

      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
      this.fileQueueService
        .processVideo({
          clerkUserId: user.id,
          ingredientId: ingredientData._id.toString(),
          organizationId: publicMetadata.organization,
          params: {
            inputPath: videoUrl,
          },
          room: getUserRoomName(user.id),
          type: 'mirror-video',
          userId: publicMetadata.user,
          websocketUrl: `/videos/${ingredientData._id}`,
        })
        .then(async (job) => {
          const result = await this.fileQueueService.waitForJob(
            job.jobId,
            60000,
          );
          const output = result.outputPath;
          const meta = await this.filesClientService.uploadToS3(
            ingredientData._id,
            `videos`,
            {
              path: output,
              type: FileInputType.FILE,
            },
          );

          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity(meta),
          );
          await this.ingredientsService.patch(
            ingredientData._id,
            new IngredientEntity({
              status: IngredientStatus.GENERATED,
              transformations: [TransformationCategory.MIRRORED],
            }),
          );

          const websocketUrl = WebSocketPaths.video(ingredientData._id);
          await this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_MIRRORED,
              id: ingredientData._id,
              status: WebSocketEventStatus.COMPLETED,
            },
            user.id,
            getUserRoomName(user.id),
          );

          try {
            fs.unlinkSync(output);
          } catch (error: unknown) {
            this.loggerService.warn(
              `Failed to cleanup temp file: ${output}`,
              error,
            );
          }
        })
        .catch(async (error: unknown) => {
          this.loggerService.error(`${url} mirrorVideo failed`, error);

          const websocketUrl = WebSocketPaths.video(ingredientData._id);
          await this.websocketService.publishMediaFailed(
            websocketUrl,
            'Failed to mirror video',
            user.id,
            getUserRoomName(user.id),
          );
        });

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
