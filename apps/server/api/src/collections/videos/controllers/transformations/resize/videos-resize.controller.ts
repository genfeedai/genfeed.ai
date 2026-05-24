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
  AssetScope,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import type { IResizeBodyParams } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
export class VideosResizeController {
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

  private requireOutputPath(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Video processing result missing outputPath');
    }

    return value;
  }

  @Post(':videoId/resize')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resizeVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() resizeVideoDto: IResizeBodyParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const video = await this.videosService.findOne({
      _id: videoId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: video.brand || publicMetadata.brand,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organization: publicMetadata.organization,
        parent: videoId,
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    this.fileQueueService
      .processVideo({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: publicMetadata.organization,
        params: {
          height: resizeVideoDto.height,
          inputPath: `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
          width: resizeVideoDto.width,
        },
        room: getUserRoomName(user.id),
        type: 'resize',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientData._id}`,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(job.jobId, 60000);
        const output = this.requireOutputPath(result.outputPath);
        const ingredientId = String(ingredientData._id);

        return this.filesClientService
          .uploadToS3(ingredientId, `videos`, {
            path: output,
            type: FileInputType.FILE,
          })
          .then(async (res) => {
            await this.ingredientsService.patch(ingredientId, {
              status: IngredientStatus.GENERATED,
              transformations: [TransformationCategory.RESIZED],
            });

            await this.metadataService.patch(
              metadataData._id,
              new MetadataEntity(res),
            );

            return res;
          });
      })
      .catch((error: unknown) => {
        this.loggerService.error(`${url} failed`, error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  @Post(':videoId/portrait')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resizeToPortrait(
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
        brand: publicMetadata.brand,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organization: publicMetadata.organization,
        parent: videoId,
        status: IngredientStatus.PROCESSING,
      });

    this.fileQueueService
      .processVideo({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: publicMetadata.organization,
        params: {
          height: 1920,
          inputPath: `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
          width: 1080,
        },
        room: getUserRoomName(user.id),
        type: 'convert-to-portrait',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientData._id}`,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(job.jobId, 60000);
        const output = this.requireOutputPath(result.outputPath);
        const meta = await this.filesClientService.uploadToS3(
          ingredientData._id,
          `videos`,
          { path: output, type: FileInputType.FILE },
        );

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity(meta),
        );
        await this.ingredientsService.patch(ingredientData._id, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.RESIZED],
        });

        const websocketUrl = WebSocketPaths.video(ingredientData._id);
        await this.websocketService.publishVideoComplete(
          websocketUrl,
          {
            eventType: WebSocketEventType.VIDEO_RESIZED,
            id: ingredientData._id,
            status: WebSocketEventStatus.COMPLETED,
            transformation: TransformationCategory.RESIZED,
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
}
