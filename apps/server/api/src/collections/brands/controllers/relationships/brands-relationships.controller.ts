/**
 * Brands Relationships Controller
 * Brand analytics aggregates (no flat dual yet).
 *
 * Media lists use flat collections:
 * - GET /videos?brand= · /images?brand= · /articles?brand=
 * - GET /credentials?brand= · /links?brand= · /posts?brand=
 * - GET /activities?brand= · /musics?brand=
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  AnalyticsQueryDto,
  TimeSeriesQueryDto,
} from '@api/collections/posts/dto/analytics-query.dto';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  AnalyticSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsRelationshipsController {
  constructor(
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Get(':brandId/analytics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findBrandAnalytics(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    await verifyBrandAccess(this.brandsService, brandId, user);

    // Count connected brands (credentials for this brand)
    const countResult = await this.credentialsService.findAll(
      {
        where: {
          brandId: brandId,
          isConnected: true,
          isDeleted: false,
          organizationId: user.organizationId,
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
      user.organizationId,
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
    await verifyBrandAccess(this.brandsService, brandId, user);

    // Get platform-specific analytics for this brand
    const startDate = query.startDate;
    const endDate = query.endDate;
    const data = await this.analyticsAggregationService.getPlatformAnalytics(
      user.organizationId,
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
    await verifyBrandAccess(this.brandsService, brandId, user);

    // Get time series data with platform breakdown
    const startDate = query.startDate;
    const endDate = query.endDate;
    const groupBy = query.groupBy || 'day';

    const timeSeriesData =
      await this.analyticsAggregationService.getTimeSeriesDataWithPlatforms(
        user.organizationId,
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
