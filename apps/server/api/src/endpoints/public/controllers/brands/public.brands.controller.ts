import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ArticleStatus, AssetScope, IngredientStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  ArticleSerializer,
  BrandSerializer,
  IngredientSerializer,
  LinkSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PublicApiFilter } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, type PipelineStage, Types } from 'mongoose';

type BrandCollectionFailure = {
  data: unknown[];
  message: string;
  pagination?: null;
};

type BrandSingleFailure = {
  data: null;
  message: string;
};

@AutoSwagger()
@Public()
@Controller('public/brands')
export class PublicBrandsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly brandsService: BrandsService,
    private readonly imagesService: ImagesService,
    private readonly linksService: LinksService,
    private readonly videosService: VideosService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) =>
      `public:brands:highlighted:${req.query.isHighlighted ?? 'false'}:limit:${req.query.limit ?? '10'}`,
    tags: ['brands', 'public'],
    ttl: 1800, // 30 minutes
  })
  async findPublicBrands(
    @Req() request: Request,
    @Query('isHighlighted') isHighlighted?: string,
    @Query('limit') limit: string = '10',
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const filter: PublicApiFilter = {
      isDeleted: false,
      scope: AssetScope.PUBLIC,
    };

    // Filter by isHighlighted if provided
    if (isHighlighted === 'true') {
      filter.isHighlighted = true;
    }

    this.logger.log(url, { query: { isHighlighted, limit } });

    const maxLimit = Math.min(Number(limit), 100); // Cap at 100
    const aggregate: PipelineStage[] = [
      { $match: filter },
      ...BrandFilterUtil.buildBrandAssetLookups({
        includeBanner: true,
        includeCredentials: false,
        includeLogo: true,
        includeReferences: false,
      }),
      { $sort: { createdAt: -1 } },
      { $limit: maxLimit },
    ];

    const options = {
      customLabels,
      pagination: false,
    };

    const data = await this.brandsService.findAll(aggregate, options);

    return serializeCollection(request, BrandSerializer, data);
  }

  @Get('slug')
  @Cache({
    keyGenerator: (req) => `brand:slug:${req.query.slug ?? ''}`,
    tags: ['brands', 'slugs'],
    ttl: 3600, // 1 hour
  })
  async findOneBySlug(
    @Req() request: Request,
    @Query('slug') slug: string,
  ): Promise<JsonApiSingleResponse | BrandSingleFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!slug) {
      return { data: null, message: 'No slug provided' };
    }

    this.logger.log(url, { query: { slug } });
    const data = await this.brandsService.findOneBySlug({
      slug: { $options: 'i', $regex: `^${slug}$` },
    });

    if (!data) {
      return { data: null, message: 'Brand not found' };
    }

    // Check if brand is public
    if (data.scope !== AssetScope.PUBLIC) {
      return { data: null, message: 'Brand is not public' };
    }

    // Ensure logo and banner are populated (findOneBySlug uses 'detail' context which should populate them)
    // The virtual fields should be populated automatically, but ensure they're loaded
    if (data && typeof data.populate === 'function') {
      await data.populate([{ path: 'logo' }, { path: 'banner' }]);
    }

    return serializeSingle(request, BrandSerializer, data);
  }

  @Get(':brandId')
  @Cache({
    keyGenerator: (req) => `public:brand:${req.params?.brandId ?? 'unknown'}`,
    tags: ['brands'],
    ttl: 1800, // 30 minutes
  })
  async findOne(
    @Req() request: Request,
    @Param('brandId') brandId: string,
  ): Promise<JsonApiSingleResponse | BrandSingleFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(brandId)) {
      return { data: null, message: 'Invalid brand ID format' };
    }

    this.logger.log(url, { params: { brandId } });
    const data = await this.brandsService.findOne(
      { _id: brandId, isDeleted: false },
      'public',
    );

    if (!data) {
      return { data: null, message: 'Brand not found' };
    }

    // Check if brand is public
    if (data.scope !== AssetScope.PUBLIC) {
      return { data: null, message: 'Brand is not public' };
    }

    // Ensure logo and banner are populated (findOne uses 'detail' context which should populate them)
    // The virtual fields should be populated automatically, but ensure they're loaded
    if (data && typeof data.populate === 'function') {
      await data.populate([{ path: 'logo' }, { path: 'banner' }]);
    }

    return serializeSingle(request, BrandSerializer, data);
  }

  @Get(':brandId/links')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:links:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'links'],
    ttl: 1800, // 30 minutes
  })
  async findBrandLinks(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(brandId)) {
      return { data: [], message: 'Invalid brand ID format' };
    }

    this.logger.log(url, { params: { brandId }, query: { sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { _id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found' };
    }

    const options = {
      customLabels,
      pagination: false,
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          scope: AssetScope.PUBLIC,
        },
      },
      { $sort: { createdAt: -1, type: 1 } },
    ];

    const data = await this.linksService.findAll(aggregate, options);
    return serializeCollection(request, LinkSerializer, data);
  }

  @Get(':brandId/videos')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:videos:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'videos'],
    ttl: 900, // 15 minutes
  })
  async findBrandVideos(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { _id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );
    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          scope: AssetScope.PUBLIC,
          status: IngredientStatus.GENERATED,
        },
      },
      { $sort: { createdAt: -1, type: 1 } },
    ];

    const data = await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':brandId/images')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:images:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'images'],
    ttl: 900, // 15 minutes
  })
  async findBrandImages(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { _id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          scope: AssetScope.PUBLIC,
          status: IngredientStatus.GENERATED,
        },
      },
      { $sort: { createdAt: -1, type: 1 } },
    ];

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':brandId/articles')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:articles:${req.query.page ?? 1}:${req.query.limit ?? 20}:${req.query.sort ?? '-createdAt'}`,
    tags: ['brands', 'articles'],
    ttl: 900, // 15 minutes
  })
  async findBrandArticles(
    @Param('brandId') brandId: string,
    @Req() request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: string = '-createdAt',
  ): Promise<JsonApiCollectionResponse | BrandCollectionFailure> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(brandId)) {
      return {
        data: [],
        message: 'Invalid brand ID format',
        pagination: null,
      };
    }

    this.logger.log(url, { params: { brandId }, query: { limit, page, sort } });

    // Verify brand exists
    const brand = await this.brandsService.findOne(
      { _id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: [], message: 'Brand not found', pagination: null };
    }

    const options = {
      customLabels,
      limit: Math.min(Number(limit), 50), // Max 50 per page
      page: Number(page),
      pagination: true,
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          scope: AssetScope.PUBLIC,
          status: ArticleStatus.PUBLIC,
        },
      },
      { $sort: { createdAt: -1, publishedAt: -1 } },
    ];

    const data = await this.articlesService.findAll(aggregate, options);
    return serializeCollection(request, ArticleSerializer, data);
  }

  // TO DO
  // DISPLAY PUBLIC BRAND ANALYTICS
  // ONCE WE HAVE ANALYTICS SERVICE
  // @Get(':brandId/analytics')
  // @Public()
  // @Cache({
  //   ttl: 3600, // 1 hour
  //   tags: ['brands', 'stats'],
  //   keyGenerator: (req) => `public:brand:${req.params?.brandId ?? 'unknown'}:stats`,
  // })
  // async getBrandStats(@Param('brandId') brandId: string): Promise<unknown> {
  //   const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
  //
  //   if (!isValidObjectId(brandId)) {
  //     return returnNotFound(this.constructorName, brandId);
  //   }
  //
  //   this.logger.log(url, { params: { brandId } });
  //
  //   // Verify brand exists
  //   const brand = await this.brandsService.findOne({
  //     _id: brandId,
  //     isDeleted: false,
  //   });
  //   if (!brand) {
  //     return returnNotFound(this.constructorName, brandId);
  //   }
  //
  //   // Get public video count
  //   const data = await this.analyticsService.findOne({
  //     brand: new Types.ObjectId(brandId),
  //   });
  //
  //   return AnalyticsSerializer.serialize(data);
  // }
}
