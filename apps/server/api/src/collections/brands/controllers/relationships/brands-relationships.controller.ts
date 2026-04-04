/**
 * Brands Relationships Controller
 * Handles brand relationship routes:
 * - Get brand videos
 * - Get brand images
 * - Get brand articles
 * - Get brand musics
 * - Get brand credentials
 * - Get brand links
 * - Get brand posts
 * - Get brand activities
 * - Get brand analytics
 */
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { LinkDocument } from '@api/collections/links/schemas/link.schema';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import {
  AnalyticsQueryDto,
  TimeSeriesQueryDto,
} from '@api/collections/posts/dto/analytics-query.dto';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import {
  ActivitySerializer,
  AnalyticSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  ArticleSerializer,
  CredentialSerializer,
  ImageSerializer,
  LinkSerializer,
  MusicSerializer,
  PostSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import {
  ArticleCategory,
  AssetScope,
  IngredientCategory,
} from '@genfeedai/enums';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsRelationshipsController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly articlesService: ArticlesService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly imagesService: ImagesService,
    private readonly linksService: LinksService,
    private readonly musicsService: MusicsService,
    private readonly postsService: PostsService,
    private readonly videosService: VideosService,
  ) {}

  /**
   * Verify user has access to this brand
   * Throws HttpException if access is denied
   */
  private async verifyBrandAccess(
    brandId: string,
    user: User,
  ): Promise<BrandDocument> {
    const publicMetadata = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
      ],
      isDeleted: false,
    });

    if (!brand) {
      if (!getIsSuperAdmin(user)) {
        throw new HttpException(
          {
            detail: 'Access denied to this brand',
            title: 'Forbidden',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        {
          detail: 'Brand not found',
          title: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return brand;
  }

  @Get(':brandId/videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandVideos(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const status =
      Object.keys(statusFilter).length > 0
        ? statusFilter.status
        : { $ne: 'failed' };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          category: IngredientCategory.VIDEO,
          isDeleted,
          scope: AssetScope.PUBLIC,
          status,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
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
      {
        $sort: handleQuerySort(query.sort || '-createdAt'),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':brandId/images')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandImages(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const status =
      Object.keys(statusFilter).length > 0
        ? statusFilter.status
        : { $ne: 'failed' };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          category: IngredientCategory.IMAGE,
          isDeleted,
          scope: AssetScope.PUBLIC,
          status,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
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
      {
        $sort: handleQuerySort(query.sort || '-createdAt'),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, ImageSerializer, data);
  }

  @Get(':brandId/articles')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandArticles(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: ArticlesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const status =
      Object.keys(statusFilter).length > 0
        ? statusFilter.status
        : { $ne: 'failed' };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          category: ArticleCategory.POST,
          isDeleted,
          scope: AssetScope.PUBLIC,
          status,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
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
      {
        $sort: handleQuerySort(query.sort || '-publishedAt'),
      },
    ];

    const data: AggregatePaginateResult<ArticleDocument> =
      await this.articlesService.findAll(aggregate, options);
    return serializeCollection(request, ArticleSerializer, data);
  }

  @Get(':brandId/musics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandMusics(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          category: IngredientCategory.MUSIC,
          isDeleted,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
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
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.musicsService.findAll(aggregate, options);
    return serializeCollection(request, MusicSerializer, data);
  }

  @Get(':brandId/credentials')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandCredentials(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
    ];

    const data: AggregatePaginateResult<CredentialDocument> =
      await this.credentialsService.findAll(aggregate, options);
    return serializeCollection(request, CredentialSerializer, data);
  }

  @Get(':brandId/links')
  @Cache({
    keyGenerator: (req) =>
      `brand:${req.params?.brandId ?? 'unknown'}:links:user:${req.user?.id ?? 'anonymous'}`,
    tags: ['brands', 'links'],
    ttl: 1_800, // 30 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandLinks(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
        },
      },
    ];

    const data: AggregatePaginateResult<LinkDocument> =
      await this.linksService.findAll(aggregate, options);
    return serializeCollection(request, LinkSerializer, data);
  }

  @Get(':brandId/posts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllPosts(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: PostsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Build match filter
    const matchFilter: unknown = {
      // Only show parent posts (not children/replies)
      // Handle both null and undefined (undefined fields aren't stored in MongoDB)
      $or: [{ parent: null }, { parent: { $exists: false } }],
      brand: new Types.ObjectId(brandId),
      isDeleted,
    };

    // Add platform filter if provided
    if (query.platform) {
      matchFilter.platform = query.platform;
    }

    // Add status filter if provided
    if (query.status) {
      matchFilter.status = query.status;
    }

    const aggregate: PipelineStage[] = [
      {
        $match: matchFilter,
      },
      {
        $lookup: {
          as: 'ingredients',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredients',
        },
      },
      {
        $addFields: {
          ingredients: {
            $map: {
              as: 'ing',
              in: {
                _id: '$$ing._id',
                category: '$$ing.category',
                status: '$$ing.status',
              },
              input: '$ingredients',
            },
          },
        },
      },
      {
        $lookup: {
          as: 'credential',
          foreignField: '_id',
          from: 'credentials',
          localField: 'credential',
        },
      },
      {
        $unwind: {
          path: '$credential',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup post-analytics to get KPIs (views, likes, comments, etc.)
      {
        $lookup: {
          as: 'analyticsData',
          foreignField: 'post',
          from: 'post-analytics',
          localField: '_id',
          pipeline: [
            {
              $group: {
                _id: null,
                avgEngagementRate: { $avg: '$engagementRate' },
                totalComments: { $sum: '$totalComments' },
                totalLikes: { $sum: '$totalLikes' },
                totalSaves: { $sum: '$totalSaves' },
                totalShares: { $sum: '$totalShares' },
                totalViews: { $sum: '$totalViews' },
              },
            },
          ],
        },
      },
      // Flatten analytics data to top level
      {
        $addFields: {
          avgEngagementRate: {
            $ifNull: [
              { $arrayElemAt: ['$analyticsData.avgEngagementRate', 0] },
              0,
            ],
          },
          totalComments: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalComments', 0] }, 0],
          },
          totalLikes: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalLikes', 0] }, 0],
          },
          totalSaves: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalSaves', 0] }, 0],
          },
          totalShares: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalShares', 0] }, 0],
          },
          totalViews: {
            $ifNull: [{ $arrayElemAt: ['$analyticsData.totalViews', 0] }, 0],
          },
        },
      },
      // Remove the temporary analyticsData array
      {
        $project: {
          analyticsData: 0,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(aggregate, options);

    return serializeCollection(request, PostSerializer, data);
  }

  @Get(':brandId/activities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllActivities(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted,
        },
      },
      ...ActivitiesService.buildEntityLookup(),
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1, key: 1, label: 1 } as SortObject),
      },
    ];

    const data: AggregatePaginateResult<ActivityDocument> =
      await this.activitiesService.findAll(aggregate, options);
    return serializeCollection(request, ActivitySerializer, data);
  }

  @Get(':brandId/analytics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandAnalytics(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    // Count connected brands (credentials for this brand)
    const countResult = await this.credentialsService.findAll(
      [
        {
          $match: {
            brand: new Types.ObjectId(brandId),
            isConnected: true,
            isDeleted: false,
            organization: new Types.ObjectId(publicMetadata.organization),
          },
        },
        { $count: 'total' },
      ],
      { pagination: false },
    );
    const totalCredentialsConnected =
      (countResult.docs[0] as unknown as { total?: number })?.total || 0;

    // Get real analytics data with custom date range
    const startDate = query.startDate;
    const endDate = query.endDate;
    const metrics = await this.analyticsAggregationService.getOverviewMetrics(
      publicMetadata.organization,
      brandId,
      startDate,
      endDate,
    );

    return serializeSingle(request, AnalyticSerializer, {
      monthlyGrowth: metrics.viewsGrowth,
      totalCredentialsConnected,
      totalPosts: metrics.totalPosts,
      totalViews: metrics.totalViews,
      viewsGrowth: metrics.viewsGrowth,
    });
  }

  @Get(':brandId/platforms/:platform/analytics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandPlatformAnalytics(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('platform') platform: string,
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    // Get platform-specific analytics for this brand
    const startDate = query.startDate;
    const endDate = query.endDate;
    const data = await this.analyticsAggregationService.getPlatformAnalytics(
      publicMetadata.organization,
      platform,
      brandId,
      startDate,
      endDate,
    );

    return serializeSingle(request, AnalyticSerializer, {
      ...data,
      platform,
    });
  }

  @Get(':brandId/analytics/timeseries')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandAnalyticsTimeSeries(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query() query: TimeSeriesQueryDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);

    // Verify user has access to this brand
    await this.verifyBrandAccess(brandId, user);

    // Get time series data with platform breakdown
    const startDate = query.startDate;
    const endDate = query.endDate;
    const groupBy = query.groupBy || 'day';

    const timeSeriesData =
      await this.analyticsAggregationService.getTimeSeriesDataWithPlatforms(
        publicMetadata.organization,
        brandId,
        startDate,
        endDate,
        groupBy,
      );

    return serializeSingle(
      request,
      AnalyticsTimeseriesWithPlatformsSerializer,
      timeSeriesData,
    );
  }
}
