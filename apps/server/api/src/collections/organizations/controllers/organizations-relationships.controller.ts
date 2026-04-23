/**
 * Organizations Relationships Controller
 * Handles organization relationship routes:
 * - Get organization brands
 * - Get organization analytics
 * - Get organization ingredients
 * - Get organization videos
 * - Get organization tags
 * - Get organization posts
 * - Get organization activities
 */
import { type ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationQueryDto } from '@api/collections/organizations/dto/organization-query.dto';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import {
  AnalyticsQueryDto,
  TimeSeriesQueryDto,
  TopContentQueryDto,
} from '@api/collections/posts/dto/analytics-query.dto';
import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { type TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { MatchConditions } from '@api/shared/utils/pipeline-builder/pipeline-builder.types';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { MemberRole } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import {
  ActivitySerializer,
  AnalyticSerializer,
  AnalyticsPlatformSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  AnalyticsTopContentSerializer,
  BrandSerializer,
  IngredientSerializer,
  PostSerializer,
  TagSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsRelationshipsController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly ingredientsService: IngredientsService,
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly tagsService: TagsService,
    private readonly videosService: VideosService,
  ) {}

  @Get(':organizationId/brands')
  @Cache({ tags: ['brands'], ttl: 300 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllBrands(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: OrganizationQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $or: [
            { user: publicMetadata.user },
            { organization: organizationId },
          ],
          isDeleted,
        },
      },
      // Lookup brand assets (logo, banner, references, credentials)
      ...BrandFilterUtil.buildBrandAssetLookups(),
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<BrandDocument> =
      await this.brandsService.findAll(aggregate, options);
    return serializeCollection(request, BrandSerializer, data);
  }

  @Get(':organizationId/analytics')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAnalytics(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<JsonApiSingleResponse> {
    // Get analytics using the aggregation service
    const startDate = query.startDate;
    const endDate = query.endDate;
    const brandId = query.brandId;

    const metrics = await this.analyticsAggregationService.getOverviewMetrics(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          isConnected: true,
          isDeleted: false,
          organization: organizationId,
        },
      },
      { $count: 'total' },
    ];

    // Get total accounts connected (credentials) using pipeline count
    const credentials = await this.credentialsService.findAll(pipeline, {
      pagination: false,
    });

    // Extract count from $count stage result (docs[0].total)
    const totalCredentialsConnected =
      (credentials.docs[0] as { total?: number })?.total || 0;

    return serializeSingle(request, AnalyticSerializer, {
      ...metrics,
      totalCredentialsConnected,
    });
  }

  @Get(':organizationId/analytics/timeseries')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAnalyticsTimeSeries(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: TimeSeriesQueryDto,
  ): Promise<JsonApiSingleResponse> {
    // Get time series data with platform breakdown
    const startDate = query.startDate;
    const endDate = query.endDate;
    const groupBy = query.groupBy || 'day';
    const brandId = query.brandId;

    const timeSeriesData =
      await this.analyticsAggregationService.getTimeSeriesDataWithPlatforms(
        organizationId,
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

  @Get(':organizationId/analytics/platforms')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAnalyticsPlatforms(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<JsonApiSingleResponse> {
    // Get platform comparison data
    const startDate = query.startDate;
    const endDate = query.endDate;
    const brandId = query.brandId;

    const platformData =
      await this.analyticsAggregationService.getPlatformComparison(
        organizationId,
        brandId,
        startDate,
        endDate,
      );

    return serializeSingle(request, AnalyticsPlatformSerializer, platformData);
  }

  @Get(':organizationId/platforms/:platform/analytics')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findPlatformAnalytics(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('platform') platform: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<JsonApiSingleResponse> {
    // Get platform-specific analytics
    const startDate = query.startDate;
    const endDate = query.endDate;
    const brandId = query.brandId;

    const metrics = await this.analyticsAggregationService.getPlatformAnalytics(
      organizationId,
      platform,
      brandId,
      startDate,
      endDate,
    );

    return serializeSingle(request, AnalyticSerializer, {
      ...metrics,
      platform,
    });
  }

  @Get(':organizationId/analytics/top-content')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAnalyticsTopContent(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: TopContentQueryDto,
  ): Promise<JsonApiSingleResponse> {
    // Get top content data
    const limit = query.limit || 10;
    const metric = query.metric || 'views';
    const startDate = query.startDate;
    const endDate = query.endDate;
    const brandId = query.brandId;

    const topContent =
      await this.analyticsAggregationService.getTopPerformingContent(
        organizationId,
        brandId,
        limit,
        // @ts-expect-error TS2345
        metric,
        startDate,
        endDate,
      );

    return serializeSingle(request, AnalyticsTopContentSerializer, topContent);
  }

  @Get(':organizationId/ingredients')
  @Cache({ tags: ['ingredients'], ttl: 120 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllIngredients(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: IngredientsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Check if the user is a member of the organization
    const member = await this.membersService.findOne({
      isDeleted: false,
      organization: organizationId,
      user: publicMetadata.user,
    });

    if (!member) {
      throw new HttpException(
        'Forbidden: You are not a member of this organization',
        HttpStatus.FORBIDDEN,
      );
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );

    const matchConditions: MatchConditions = {
      isDeleted,
      organization: organizationId,
      ...(statusFilter as MatchConditions),
      ...(query.search
        ? {
            $or: [
              { label: { $options: 'i', $regex: query.search } },
              { description: { $options: 'i', $regex: query.search } },
            ] as MatchConditions[],
          }
        : {}),
      ...(query.category && { category: query.category }),
      ...(query.brand &&
        isValidObjectId(query.brand) && {
          brand: query.brand,
        }),
      ...(Object.keys(parentConditions).length > 0 && {
        $and: [parentConditions as MatchConditions],
      }),
    };

    const aggregate = PipelineBuilder.create()
      .match(matchConditions)
      .add(...IngredientFilterUtil.buildMetadataLookup())
      .add(...IngredientFilterUtil.buildFormatFilterStage(query.format))
      .sort(handleQuerySort(query.sort))
      .build();

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':organizationId/videos')
  @Cache({ tags: ['videos'], ttl: 60 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllVideos(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: organizationId,
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':organizationId/tags')
  @Cache({ tags: ['tags'], ttl: 600 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllTags(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Build match conditions to return:
    // 1. Global tags (no organization and no user)
    // 2. Tags for this specific organization
    // 3. Tags for the current user
    const aggregate = PipelineBuilder.create()
      .match({
        $or: [
          // Global tags (default/system tags)
          { organization: { $exists: false }, user: { $exists: false } },
          // Tags for this organization
          { organization: organizationId },
          // Tags for the current user
          { user: publicMetadata.user },
        ],
        isDeleted,
      })
      .sort(handleQuerySort(query.sort))
      .build();

    const data: AggregatePaginateResult<TagDocument> =
      await this.tagsService.findAll(aggregate, options);
    return serializeCollection(request, TagSerializer, data);
  }

  @Get(':organizationId/posts')
  @Cache({ tags: ['posts'], ttl: 60 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllPosts(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: PostsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Check if user has member access to this organization
    const member = await this.membersService.findOne({
      isActive: true,
      isDeleted: false,
      organization: organizationId,
      user: publicMetadata.user,
    });

    const isOwner = await this.organizationsService.findOne({
      _id: organizationId,
      user: publicMetadata.user,
    });

    // Verify user has access to this organization (owner, member, or superadmin)
    if (!isOwner && !member && !getIsSuperAdmin(user, request)) {
      throw new HttpException(
        {
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Build match filter
    const matchFilter: MatchConditions = {
      // Only show parent posts (not children/replies)
      // Handle both null and undefined (undefined fields aren't stored in MongoDB)
      $or: [{ parent: null }, { parent: { $exists: false } }],
      isDeleted,
      organization: organizationId,
    };

    // Add platform filter if provided
    if (query.platform) {
      matchFilter.platform = query.platform;
    }

    // Add status filter if provided
    if (query.status) {
      matchFilter.status = query.status;
    }

    const aggregate: Record<string, unknown>[] = [
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

  @Get(':organizationId/activities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllActivities(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Check if user has member access to this organization
    const member = await this.membersService.findOne({
      isActive: true,
      isDeleted: false,
      organization: organizationId,
      user: publicMetadata.user,
    });

    const isOwner = await this.organizationsService.findOne({
      _id: organizationId,
      user: publicMetadata.user,
    });

    // Verify user has access to this organization (owner, member, or superadmin)
    if (!isOwner && !member && !getIsSuperAdmin(user, request)) {
      throw new HttpException(
        {
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          organization: organizationId,
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

  // Duplicate route removed - use findAnalytics() above which has role-based access control
}
