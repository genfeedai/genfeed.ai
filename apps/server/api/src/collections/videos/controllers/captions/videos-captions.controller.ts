import fs from 'node:fs';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CreateVideoWithCaptionsDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
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
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import {
  CaptionSerializer,
  IngredientSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

/**
 * VideosCaption Controller
 * Handles all caption-related operations for videos
 * - Get video captions
 * - Add captions to video
 */

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosCaptionsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,

    private readonly filesClientService: FilesClientService,
    private readonly captionsService: CaptionsService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Get(':videoId/captions')
  @Cache({
    keyGenerator: (req) =>
      `videos:${req.params?.videoId ?? 'unknown'}:captions:user:${req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`,
    tags: ['videos', 'captions'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCaptions(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify video exists and user has access
    const video = await this.videosService.findOne({
      _id: videoId,
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
      ],
      isDeleted: false,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Build aggregation pipeline to get captions for this video (ingredient)
    const aggregate: PipelineStage[] = [
      {
        $match: {
          ingredient: new Types.ObjectId(videoId),
          isDeleted: false,
        },
      },
      {
        $lookup: {
          as: 'ingredient',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredient',
        },
      },
      {
        $unwind: {
          path: '$ingredient',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          as: 'ingredient.metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'ingredient.metadata',
        },
      },
      {
        $unwind: {
          path: '$ingredient.metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    const data = await this.captionsService.findAll(aggregate, options);
    return serializeCollection(request, CaptionSerializer, data);
  }

  @Post(':videoId/captions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createVideoWithCaptions(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() createVideoWithCaptionsDto: CreateVideoWithCaptionsDto,
  ) {
    const url = `videos-captions:${this.constructorName}:createVideoWithCaptions:user:${user.id}:videoId:${videoId}`;
    const video = await this.videosService.findOne({ _id: videoId }, [
      { path: 'captions' },
    ]);

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    let caption;
    if (isValidObjectId(createVideoWithCaptionsDto.caption)) {
      caption = await this.captionsService.findOne({
        _id: new Types.ObjectId(createVideoWithCaptionsDto.caption),
      });
    } else {
      caption = (
        video as unknown as { captions?: Array<{ _id: Types.ObjectId }> }
      ).captions?.[0];
    }

    if (!caption) {
      return returnNotFound('Caption', videoId);
    }

    const publicMetadata = getPublicMetadata(user);
    const { ingredientData, metadataData } =
      await this.sharedService.saveDocuments(user, {
        brand: new Types.ObjectId(publicMetadata.brand),
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        label: generateLabel(),
        organization: new Types.ObjectId(publicMetadata.organization),
        parent: new Types.ObjectId(videoId),
        scope: AssetScope.USER,
        status: IngredientStatus.PROCESSING,
      });

    // Queue captions addition in files.genfeed service
    this.fileQueueService
      .processVideo({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: publicMetadata.organization,
        params: {
          // @ts-expect-error TS2339
          captionContent: caption.content,
          inputPath: `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
        },
        room: getUserRoomName(user.id),
        type: 'add-captions',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientData._id}`,
      })
      .then(async (job) => {
        const result = await this.fileQueueService.waitForJob(job.jobId, 60000);
        const output = result.outputPath;
        const ingredientId = (
          ingredientData._id as Types.ObjectId
        ).toHexString();

        this.filesClientService
          .uploadToS3(ingredientId, `videos`, {
            path: output,
            type: FileInputType.FILE,
          })
          .then(async (res) => {
            await this.ingredientsService.patch(
              ingredientId,
              new IngredientEntity({
                status: IngredientStatus.GENERATED,
                transformations: [TransformationCategory.CAPTIONED],
              }),
            );

            await this.metadataService.patch(
              metadataData._id,
              new MetadataEntity(res),
            );

            const websocketUrl = `/videos/${ingredientId}`;
            await this.websocketService.publishVideoComplete(
              websocketUrl,
              {
                // @ts-expect-error TS2339
                captionId: caption.id,
                eventType: WebSocketEventType.CAPTIONS_COMPLETED,
                id: ingredientId,
                status: WebSocketEventStatus.COMPLETED,
              },
              user.id,
              getUserRoomName(user.id),
            );

            if (this.configService.isProduction) {
              try {
                fs.unlinkSync(output);
              } catch (error: unknown) {
                this.loggerService.warn(
                  `Failed to cleanup temp file: ${output}`,
                  error,
                );
              }
            }
          })
          .catch((error: unknown) => {
            this.loggerService.error(`${url} uploadToS3 failed`, error);
          });
      })
      .catch((error: unknown) => {
        this.loggerService.error(`${url} addCaptionsToVideo failed`, error);
      });

    return serializeSingle(request, IngredientSerializer, ingredientData);
  }
}
