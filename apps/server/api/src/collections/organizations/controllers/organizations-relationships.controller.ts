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

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
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
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { TagDocument } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import type { VideoDocument } from '@api/collections/videos/schemas/video.schema';
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
} from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { MemberRole, PostStatus } from '@genfeedai/enums';
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

  /**
   * Verify user has access to organization (owner, member, or superadmin)
   * Throws HttpException if access is denied
   */
  private async verifyOrganizationAccess(
    request: Request,
    organizationId: string,
    user: User,
  ): Promise<void> {
    const publicMetadata = getPublicMetadata(user);

    const [member, isOwner] = await Promise.all([
      this.membersService.findOne({
        isActive: true,
        isDeleted: false,
        organization: organizationId,
        user: publicMetadata.user,
      }),
      this.organizationsService.findOne({
        _id: organizationId,
        user: publicMetadata.user,
      }),
    ]);

    if (!isOwner && !member && !getIsSuperAdmin(user, request)) {
      throw new HttpException(
        {
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

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
    const data: AggregatePaginateResult<BrandDocument> =
      await this.brandsService.findAll(
        {
          include: { credentials: true },
          orderBy: handleQuerySort(query.sort),
          where: {
            OR: [
              { user: publicMetadata.user },
              { organization: organizationId },
            ],
            isDeleted,
          },
        },
        options,
      );
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

    const pipeline = {
      where: {
        isConnected: true,
        isDeleted: false,
        organization: organizationId,
      },
    };

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
    await this.verifyOrganizationAccess(request, organizationId, user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );

    const where = {
      isDeleted,
      organization: organizationId,
      ...statusFilter,
      ...(query.search && {
        OR: [
          { label: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.category && { category: query.category }),
      ...(query.brand &&
        isEntityId(query.brand) && {
          brand: query.brand,
        }),
      ...(Object.keys(parentConditions).length > 0 && {
        AND: [parentConditions],
      }),
    };

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(
        {
          include: { metadata: true },
          orderBy: handleQuerySort(query.sort),
          where,
        },
        options,
      );
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
    const data = (await this.videosService.findAll(
      {
        orderBy: handleQuerySort(query.sort),
        where: {
          isDeleted,
          organization: organizationId,
          user: publicMetadata.user,
        },
      },
      options,
    )) as unknown as AggregatePaginateResult<VideoDocument>;
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

    const data: AggregatePaginateResult<TagDocument> =
      await this.tagsService.findAll(
        {
          orderBy: handleQuerySort(query.sort),
          where: {
            OR: [
              { organizationId: null, userId: null },
              { organizationId },
              { userId: publicMetadata.user },
            ],
            isDeleted,
          },
        },
        options,
      );
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
    await this.verifyOrganizationAccess(request, organizationId, user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const scheduledDate: { gte?: Date; lte?: Date } = {};
    if (query.startDate) {
      scheduledDate.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      scheduledDate.lte = new Date(query.endDate);
    }

    const where: Record<string, unknown> = {
      isDeleted,
      organization: organizationId,
      parentId: null,
      ...(Object.keys(scheduledDate).length > 0 && { scheduledDate }),
      ...(query.platform && { platform: query.platform }),
      ...(query.publicationState === 'posted'
        ? { status: PostStatus.PUBLIC }
        : query.publicationState === 'not-posted'
          ? { status: { not: PostStatus.PUBLIC } }
          : query.status
            ? { status: query.status }
            : {}),
      ...(query.credential && { credential: query.credential }),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                description: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                label: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(
        {
          include: {
            credential: true,
            ingredients: true,
            postAnalytics: true,
          },
          orderBy: handleQuerySort(query.sort),
          where,
        },
        options,
      );
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
    await this.verifyOrganizationAccess(request, organizationId, user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data: AggregatePaginateResult<ActivityDocument> =
      await this.activitiesService.findAll(
        {
          orderBy: query.sort
            ? handleQuerySort(query.sort)
            : ({ createdAt: -1, key: 1, label: 1 } as SortObject),
          where: {
            isDeleted,
            organization: organizationId,
          },
        },
        options,
      );
    return serializeCollection(request, ActivitySerializer, data);
  }
}
