/**
 * Organizations Relationships Controller
 * Handles organization relationship routes:
 * - Get organization analytics (aggregates — no flat dual)
 * - Get organization ingredients (no flat mixed list)
 *
 * Prefer flat lists for relationship duals:
 * - GET /brands?organization=
 * - GET /posts?organization=
 * - GET /activities?organization=
 * - GET /videos (org-scoped via session)
 * - GET /tags?organization=
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import {
  AnalyticsQueryDto,
  TimeSeriesQueryDto,
  TopContentQueryDto,
} from '@api/collections/posts/dto/analytics-query.dto';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { MemberRole } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  AnalyticSerializer,
  AnalyticsPlatformSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  AnalyticsTopContentSerializer,
  IngredientSerializer,
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
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly credentialsService: CredentialsService,
    private readonly ingredientsService: IngredientsService,
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
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
    const [member, isOwner] = await Promise.all([
      this.membersService.findOne({
        isActive: true,
        organizationId: organizationId,
        userId: user.userId ?? user.id,
      }),
      this.organizationsService.findOne({
        id: organizationId,
        userId: user.userId ?? user.id,
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
        organizationId,
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
      query.parentId,
    );
    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folderId,
    );
    const metadataWhere = {
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(query.format ? { extension: query.format } : {}),
    };

    const where = {
      isDeleted,
      organizationId: organizationId,
      ...folderConditions,
      ...(Object.keys(metadataWhere).length > 0 && {
        metadata: { is: metadataWhere },
      }),
      ...statusFilter,
      ...(query.category && { category: query.category }),
      ...(query.brandId &&
        isEntityId(query.brandId) && {
          brandId: query.brandId,
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

  // Nested videos/tags duals removed: prefer GET /videos and GET /tags?organization=
}
