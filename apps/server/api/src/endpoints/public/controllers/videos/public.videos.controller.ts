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
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import {
  AssetScope,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  PostStatus,
} from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { MongoMatchQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

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
    @Query('format') format?: string,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const match: MongoMatchQuery = {
      category: IngredientCategory.VIDEO,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: {
        $in: [IngredientStatus.GENERATED],
      },
    };

    // Filter by brand if provided
    if (brand && isValidObjectId(brand)) {
      match.brand = new Types.ObjectId(brand);
    }

    // Filter by tag if provided (assuming tags are stored in metadata)
    if (tag) {
      match['metadata.tags'] = { $options: 'i', $regex: tag };
    }

    const aggregate: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'metadata',
        },
      },
      {
        $unwind: {
          path: '$metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Filter by format (portrait/landscape/square) based on metadata dimensions
      ...(format
        ? [
            {
              $match: {
                $expr: this.getFormatExpression(format),
              },
            } as PipelineStage,
          ]
        : []),
      { $sort: { createdAt: -1 } },
    ];

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

    if (!isValidObjectId(videoId)) {
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

  /**
   * Get MongoDB expression for format filtering based on width/height
   * @param format - The format filter (portrait, landscape, square)
   * @returns MongoDB expression object
   */
  private getFormatExpression(format: string): unknown {
    const normalizedFormat = format.toLowerCase();

    switch (normalizedFormat) {
      case IngredientFormat.PORTRAIT:
        // Portrait: height > width
        return {
          $gt: ['$metadata.height', '$metadata.width'],
        };
      case IngredientFormat.LANDSCAPE:
        // Landscape: width > height
        return {
          $gt: ['$metadata.width', '$metadata.height'],
        };
      case IngredientFormat.SQUARE:
        // Square: width === height
        return {
          $eq: ['$metadata.width', '$metadata.height'],
        };
      default:
        // Invalid format, return true to include all
        return true;
    }
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
