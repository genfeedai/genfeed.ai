import fs from 'node:fs';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
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
import type {
  ITextOverlayBodyParams,
  ITrimVideoBodyParams,
} from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('videos')
export class VideosEditsController {
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

  @Post(':videoId/trim')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async trimVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() trimParams: ITrimVideoBodyParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      user: new Types.ObjectId(publicMetadata.user),
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const duration = trimParams.endTime - trimParams.startTime;
    if (duration < 2 || duration > 15) {
      throw new HttpException(
        'Trim duration must be between 2 and 15 seconds',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (trimParams.startTime < 0) {
      throw new HttpException(
        'Start time must be non-negative',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: new Types.ObjectId(video.brand || video.brand),
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organization: new Types.ObjectId(video.organization),
          parent: new Types.ObjectId(videoId),
          status: IngredientStatus.PROCESSING,
        });

      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
      this.fileQueueService
        .processVideo({
          clerkUserId: user.id,
          ingredientId: ingredientData._id.toString(),
          organizationId: publicMetadata.organization,
          params: {
            endTime: trimParams.endTime,
            inputPath: videoUrl,
            startTime: trimParams.startTime,
          },
          room: `user-${user.id}`,
          type: 'trim-video',
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

          await this.metadataService.patch(metadataData._id, {
            duration: meta.duration,
            height: meta.height,
            size: meta.size,
            width: meta.width,
          });

          await this.ingredientsService.patch(ingredientData._id, {
            status: IngredientStatus.GENERATED,
          });

          const websocketUrl = WebSocketPaths.video(ingredientData._id);
          await this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_TRIMMED,
              id: ingredientData._id,
              status: WebSocketEventStatus.COMPLETED,
            },
            user.id,
            `user-${user.id}`,
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
          this.loggerService.error(`${url} trimVideo failed`, error);

          const websocketUrl = WebSocketPaths.video(ingredientData._id);
          await this.websocketService.publishMediaFailed(
            websocketUrl,
            'Failed to trim video',
            user.id,
            `user-${user.id}`,
          );
        });

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post(':videoId/text-overlay')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addTextOverlay(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() createVideoDto: ITextOverlayBodyParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      user: new Types.ObjectId(publicMetadata.user),
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    if (!createVideoDto.text) {
      throw new HttpException(
        {
          detail: 'Text is required for overlay',
          title: 'Text validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const originalMetadata = await this.metadataService.findOne({
      ingredient: videoId,
    });

    if (!originalMetadata) {
      throw new HttpException(
        {
          detail: 'Unable to find video metadata',
          title: 'Metadata not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: new Types.ObjectId(video.brand || video.brand),
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          height: originalMetadata.height,
          organization: new Types.ObjectId(video.organization),
          parent: new Types.ObjectId(videoId),
          status: IngredientStatus.PROCESSING,
          width: originalMetadata.width,
        });

      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
      this.fileQueueService
        .processVideo({
          clerkUserId: user.id,
          ingredientId: ingredientData._id.toString(),
          organizationId: publicMetadata.organization,
          params: {
            height: originalMetadata.height,
            inputPath: videoUrl,
            position: createVideoDto.position || 'top',
            text: createVideoDto.text,
            width: originalMetadata.width,
          },
          room: `user-${user.id}`,
          type: 'add-text-overlay',
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

          await this.metadataService.patch(metadataData._id, {
            duration: meta.duration,
            height: meta.height,
            label: `Text Overlay: ${createVideoDto.text}`,
            size: meta.size,
            width: meta.width,
          });

          await this.ingredientsService.patch(ingredientData._id, {
            status: IngredientStatus.GENERATED,
          });

          const websocketUrl = WebSocketPaths.video(ingredientData._id);
          await this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_REVERSED,
              id: ingredientData._id,
              status: WebSocketEventStatus.COMPLETED,
            },
            user.id,
            `user-${user.id}`,
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
        .catch((error: unknown) => {
          this.loggerService.error(`${url} addTextOverlay failed`, error);
        });

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
