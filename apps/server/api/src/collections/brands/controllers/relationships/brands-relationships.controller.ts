/**
 * Brands Relationships Controller
 * Handles brand relationship routes that are not yet available as flat
 * collection filters (musics) and brand analytics aggregates.
 *
 * Prefer flat lists for media and related collections:
 * - GET /videos?brand=
 * - GET /images?brand=
 * - GET /articles?brand=
 * - GET /credentials?brand=
 * - GET /links?brand=
 * - GET /posts?brand=
 * - GET /activities?brand=
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import {
  AnalyticsQueryDto,
  TimeSeriesQueryDto,
} from '@api/collections/posts/dto/analytics-query.dto';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  AnalyticSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  MusicSerializer,
} from '@genfeedai/serializers';
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

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsRelationshipsController {
  constructor(
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly musicsService: MusicsService,
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
      _id: brandId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
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

    const aggregate = {
      where: {
        brand: brandId,
        category: IngredientCategory.MUSIC,
        isDeleted,
        user: publicMetadata.user,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data = (await this.musicsService.findAll(
      aggregate,
      options,
    )) as unknown as AggregatePaginateResult<IngredientDocument>;
    return serializeCollection(request, MusicSerializer, data);
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
      {
        where: {
          brand: brandId,
          isConnected: true,
          isDeleted: false,
          organization: publicMetadata.organization,
        },
      },
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
