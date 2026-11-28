import fs from 'node:fs';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { settleSharedIngredientGeneration } from '@api/collections/ingredients/utils/ingredient-status-transition.util';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideoRepostVariantDto } from '@api/collections/videos/dto/video-repost-variant.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ApiKeyScope,
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientRelationKind,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/contracts';
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
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

function requirePath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Missing output path');
  }

  return value;
}

@AutoSwagger()
@Controller('videos')
@OrganizationModule('playground')
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
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
  ) {}

  private async processingVideoUrl(
    organizationId: string,
    videoId: string,
  ): Promise<string> {
    if (!this.configService.isAuthorizedMediaDeliveryEnabled) {
      return `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
    }
    if (!this.authorizedMediaUrls)
      throw new Error('Authorized media issuer is unavailable');
    const urls = await this.authorizedMediaUrls.issueServerPublish(
      organizationId,
      [videoId],
    );
    const url = urls.get(videoId);
    if (!url) throw new Error('The source video has no authorized media URL');
    return url;
  }

  @Post(':videoId/reverse')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @RequiredScopes(ApiKeyScope.VIDEOS_CREATE)
  async reverseVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const video = await this.videosService.findOne({
      id: videoId,
      userId: user.userId ?? user.id,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        origin: IngredientOrigin.GENERATED,
        brandId: video.brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organizationId: video.organizationId ?? undefined,
        parentId: videoId,
        relationKind: IngredientRelationKind.TRANSFORMATION,
        status: IngredientStatus.PROCESSING,
      });

    const videoUrl = await this.processingVideoUrl(
      user.organizationId.toString(),
      videoId,
    );
    this.fileQueueService
      .processVideo({
        ingredientId: ingredientData.id.toString(),
        organizationId: user.organizationId,
        params: {
          inputPath: videoUrl,
        },
        room: getUserRoomName(user.id),
        type: 'reverse-video',
        userId: user.userId ?? user.id,
        websocketUrl: `/videos/${ingredientData.id}`,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(job.jobId, 60000);
        const output = requirePath(result.outputPath);
        const meta = await this.filesClientService.uploadToS3(
          ingredientData.id,
          `videos`,
          { path: output, type: FileInputType.FILE },
        );

        await this.metadataService.patch(
          metadataData.id,
          new MetadataEntity(meta),
        );
        const isSettled = await settleSharedIngredientGeneration(
          this.ingredientsService,
          {
            data: {
              ...(meta.s3Key ? { s3Key: meta.s3Key } : {}),
              transformations: [TransformationCategory.REVERSED],
            },
            id: ingredientData.id,
            organizationId: user.organizationId,
            to: IngredientStatus.GENERATED,
          },
        );

        if (isSettled) {
          const websocketUrl = WebSocketPaths.video(ingredientData.id);
          await this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              eventType: WebSocketEventType.VIDEO_REVERSED,
              id: ingredientData.id,
              status: WebSocketEventStatus.COMPLETED,
            },
            user.id,
            getUserRoomName(user.id),
          );
        }
      })
      .catch((error: unknown) => {
        this.loggerService.error(`${url} failed`, error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }

  @Post(':videoId/mirror')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @RequiredScopes(ApiKeyScope.VIDEOS_CREATE)
  async mirrorVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const video = await this.videosService.findOne({
      id: videoId,
      userId: user.userId ?? user.id,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(user, {
          origin: IngredientOrigin.GENERATED,
          brandId: video.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organizationId: video.organizationId ?? undefined,
          parentId: videoId,
          relationKind: IngredientRelationKind.TRANSFORMATION,
          status: IngredientStatus.PROCESSING,
        });

      const videoUrl = await this.processingVideoUrl(
        user.organizationId.toString(),
        videoId,
      );
      this.fileQueueService
        .processVideo({
          ingredientId: ingredientData.id.toString(),
          organizationId: user.organizationId,
          params: {
            inputPath: videoUrl,
          },
          room: getUserRoomName(user.id),
          type: 'mirror-video',
          userId: user.userId ?? user.id,
          websocketUrl: `/videos/${ingredientData.id}`,
        })
        .then(async (job) => {
          const result = await this.fileQueueService.waitForJob(
            job.jobId,
            60000,
          );
          const output = requirePath(result.outputPath);
          const meta = await this.filesClientService.uploadToS3(
            ingredientData.id,
            `videos`,
            {
              path: output,
              type: FileInputType.FILE,
            },
          );

          await this.metadataService.patch(
            metadataData.id,
            new MetadataEntity(meta),
          );
          const isSettled = await settleSharedIngredientGeneration(
            this.ingredientsService,
            {
              data: {
                ...(meta.s3Key ? { s3Key: meta.s3Key } : {}),
                transformations: [TransformationCategory.MIRRORED],
              },
              id: ingredientData.id,
              organizationId: user.organizationId,
              to: IngredientStatus.GENERATED,
            },
          );

          if (isSettled) {
            const websocketUrl = WebSocketPaths.video(ingredientData.id);
            await this.websocketService.publishVideoComplete(
              websocketUrl,
              {
                eventType: WebSocketEventType.VIDEO_MIRRORED,
                id: ingredientData.id,
                status: WebSocketEventStatus.COMPLETED,
              },
              user.id,
              getUserRoomName(user.id),
            );
          }

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

          const websocketUrl = WebSocketPaths.video(ingredientData.id);
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

  /**
   * One new version of the video with the picked changes applied in a single
   * pass: mirror, a little faster, a slight zoom, a cut start. Meant for
   * posting the same video again without it being frame-identical.
   */
  @Post(':videoId/repost-variant')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @RequiredScopes(ApiKeyScope.VIDEOS_CREATE)
  async repostVariant(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() dto: VideoRepostVariantDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const isMirrored = dto.isMirrored === true;
    const speed = dto.speed ?? 1;
    const zoom = dto.zoom ?? 1;
    const trimStartSeconds = dto.trimStartSeconds ?? 0;
    if (!isMirrored && speed === 1 && zoom === 1 && trimStartSeconds === 0) {
      throw new HttpException(
        'Pick at least one change for the variant',
        HttpStatus.BAD_REQUEST,
      );
    }

    const video = await this.videosService.findOne({
      id: videoId,
      userId: user.userId ?? user.id,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    try {
      // Resolved first: a lookup failure must not leave a PROCESSING child
      // that no job will ever finish.
      const videoUrl = await this.processingVideoUrl(
        user.organizationId.toString(),
        videoId,
      );
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(user, {
          origin: IngredientOrigin.GENERATED,
          brandId: video.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organizationId: video.organizationId ?? undefined,
          parentId: videoId,
          relationKind: IngredientRelationKind.TRANSFORMATION,
          status: IngredientStatus.PROCESSING,
        });

      this.fileQueueService
        .processVideo({
          ingredientId: ingredientData.id.toString(),
          organizationId: user.organizationId,
          params: {
            inputPath: videoUrl,
            isMirrored,
            speed,
            trimStartSeconds,
            zoom,
          },
          room: getUserRoomName(user.id),
          type: 'repost-variant-video',
          userId: user.userId ?? user.id,
          websocketUrl: `/videos/${ingredientData.id}`,
        })
        .then(async (job) => {
          const result = await this.fileQueueService.waitForJob(
            job.jobId,
            120000,
          );
          const output = requirePath(result.outputPath);
          const meta = await this.filesClientService.uploadToS3(
            ingredientData.id,
            `videos`,
            { path: output, type: FileInputType.FILE },
          );

          await this.metadataService.patch(
            metadataData.id,
            new MetadataEntity(meta),
          );
          const isSettled = await settleSharedIngredientGeneration(
            this.ingredientsService,
            {
              data: {
                ...(meta.s3Key ? { s3Key: meta.s3Key } : {}),
                transformations: [
                  TransformationCategory.EDITED,
                  ...(isMirrored ? [TransformationCategory.MIRRORED] : []),
                ],
              },
              id: ingredientData.id,
              organizationId: user.organizationId,
              to: IngredientStatus.GENERATED,
            },
          );

          if (isSettled) {
            await this.websocketService.publishVideoComplete(
              WebSocketPaths.video(ingredientData.id),
              {
                eventType: WebSocketEventType.VIDEO_VARIANT,
                id: ingredientData.id,
                status: WebSocketEventStatus.COMPLETED,
              },
              user.id,
              getUserRoomName(user.id),
            );
          }

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
          this.loggerService.error(`${url} repostVariant failed`, error);

          await this.websocketService.publishMediaFailed(
            WebSocketPaths.video(ingredientData.id),
            'Failed to create the repost variant',
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
