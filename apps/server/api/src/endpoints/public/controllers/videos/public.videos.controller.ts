import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  PostStatus,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

@AutoSwagger()
@Public()
@Controller('public/videos')
export class PublicVideosController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly videosService: VideosService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:videos:${JSON.stringify(req.query)}`,
    tags: ['videos', 'public'],
    ttl: 600, // 10 minutes
  })
  async findPublicVideos(
    @Req() request: ExpressRequest,
    @Query() query: BaseQueryDto,
    @Query('tag') tag?: string,
    @Query('brand') brand?: string,
    @Query('format') _format?: string,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const match: PrismaWhereQuery = {
      category: IngredientCategory.VIDEO,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: {
        in: [IngredientStatus.GENERATED],
      },
    };

    // Filter by brand if provided
    if (brand && isEntityId(brand)) {
      match.brand = brand;
    }

    // Filter by tag if provided (assuming tags are stored in metadata)
    if (tag) {
      match['metadata.tags'] = { mode: 'insensitive', contains: tag };
    }

    const aggregate = { where: match, orderBy: { createdAt: -1 } };

    const data = await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':videoId')
  @Cache({
    keyGenerator: (req) => `public:video:${req.params?.videoId ?? 'unknown'}`,
    tags: ['videos'],
    ttl: 1800, // 30 minutes
  })
  async getVideoMetadata(
    @Req() request: ExpressRequest,
    @Param('videoId') videoId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(videoId)) {
      return returnNotFound(this.constructorName, videoId);
    }

    this.logger.log(url, { params: { videoId } });
    const video = await this.videosService.findOne({
      _id: videoId,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: PostStatus.PUBLIC,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    return serializeSingle(request, VideoSerializer, video);
  }

  // REQUIRED FOR TOPAZ VIDEO UPSCALE MODEL AND DISCORD NOTIFICATIONS
  @Get(':videoId/video.mp4')
  async getVideo(
    @Param('videoId') videoId: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { params: { videoId } });

    const video = await this.videosService.findOne({
      _id: videoId,
      isDeleted: false,
      // scope: AssetScope.PUBLIC,
      // status: PostStatus.PUBLIC,
    });

    if (!video) {
      returnNotFound(this.constructorName, videoId);
    }

    try {
      const fileStream = await this.filesClientService.getFileFromS3(
        videoId,
        'videos',
      );
      res.set({
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Disposition': `inline; filename="${videoId}.mp4"`,
        'Content-Type': 'video/mp4',
      });
      fileStream.pipe(res);
      return;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      returnNotFound(this.constructorName, videoId);
    }
  }
}
