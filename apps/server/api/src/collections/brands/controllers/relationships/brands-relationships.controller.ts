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
import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
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
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  AnalyticSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
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
