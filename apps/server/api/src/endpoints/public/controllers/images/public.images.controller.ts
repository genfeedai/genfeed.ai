import { ImagesService } from '@api/collections/images/services/images.service';
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
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  AssetScope,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
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
@Controller('public/images')
export class PublicImagesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly imagesService: ImagesService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:images:${JSON.stringify(req.query)}`,
    tags: ['images', 'public'],
    ttl: 600, // 10 minutes
  })
  async findPublicImages(
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

    const matchQuery: MongoMatchQuery = {
      category: IngredientCategory.IMAGE,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: {
        $in: [IngredientStatus.GENERATED],
      },
    };

    // Filter by brand if provided
    if (brand && isValidObjectId(brand)) {
      matchQuery.brand = new Types.ObjectId(brand);
    }

    // Filter by tag if provided (assuming tags are stored in metadata)
    if (tag) {
      matchQuery['metadata.tags'] = { $options: 'i', $regex: tag };
    }

    const aggregate: PipelineStage[] = [
      { $match: matchQuery },
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
      {
        $lookup: {
          as: 'brand',
          from: 'brands',
          let: { brandId: '$brand' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$brandId'] },
                    { $eq: ['$scope', 'public'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$brand',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          as: 'brandLogo',
          from: 'assets',
          let: { brandId: '$brand._id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$parent', '$$brandId'] },
                    { $eq: ['$category', 'logo'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$brandLogo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: { 'brand.logo': '$brandLogo._id' },
      },
      {
        $project: { brandLogo: 0 },
      },
      { $sort: { createdAt: -1 } },
    ];

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':imageId')
  @Cache({
    keyGenerator: (req) => `public:image:${req.params?.imageId ?? 'unknown'}`,
    tags: ['images'],
    ttl: 1800, // 30 minutes
  })
  async getImageMetadata(
    @Req() request: ExpressRequest,
    @Param('imageId') imageId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(imageId)) {
      return returnNotFound(this.constructorName, imageId);
    }

    this.logger.log(url, { params: { imageId } });
    const image = await this.imagesService.findOne(
      {
        _id: imageId,
        category: IngredientCategory.IMAGE,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: IngredientStatus.GENERATED,
      },
      [PopulatePatterns.metadataFull, PopulatePatterns.brandMinimal],
    );

    if (!image) {
      return returnNotFound(this.constructorName, imageId);
    }

    return serializeSingle(request, IngredientSerializer, image);
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

  @Get(':imageId/image.jpg')
  async getImage(
    @Param('imageId') imageId: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const image = await this.imagesService.findOne({
      _id: imageId,
      category: IngredientCategory.IMAGE,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: IngredientStatus.GENERATED,
    });

    if (!image) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    try {
      const fileStream = await this.filesClientService.getFileFromS3(
        imageId,
        'images',
      );
      res.set({
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Disposition': `inline; filename="${imageId}.jpg"`,
        'Content-Type': 'image/jpeg',
      });
      fileStream.pipe(res);
      return;
    } catch {
      res.status(404).json({ error: 'Image file not found' });
      return;
    }
  }
}
