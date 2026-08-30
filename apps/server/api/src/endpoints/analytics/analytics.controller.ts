import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { AnalyticsService } from '@server/endpoints/analytics/analytics.service';
import { AnalyticsExportService } from '@api/endpoints/analytics/analytics-export.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import {
  AnalyticsDateRangeDto,
  AnalyticsExportQueryDto,
  AnalyticsFilterQueryDto,
  GrowthQueryDto,
  TopContentQueryDto,
  ViralHooksQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@server/services/integrations/instagram/services/instagram.service';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  AnalyticsEngagementSerializer,
  AnalyticsGrowthSerializer,
  AnalyticsHooksSerializer,
  AnalyticsOverviewSerializer,
  AnalyticsPlatformSerializer,
  AnalyticsTimeseriesWithPlatformsSerializer,
  AnalyticsTopContentSerializer,
  AnalyticsTrendSerializer,
  BusinessAnalyticsSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

@AutoSwagger()
@Controller('analytics')
@UseGuards(RolesGuard)
@UseInterceptors(RedisCacheInterceptor)
export class AnalyticsController {
  private readonly constructorName: string = String(this.constructor.name);

  private getScopedOrganizationId(user: User): string | undefined {
    if (getIsSuperAdmin(user)) {
      return undefined;
    }

    if (!user.organizationId) {
      throw new ForbiddenException(
        'You must be part of an organization to access analytics',
      );
    }

    return user.organizationId;
  }

  constructor(
    private readonly loggerService: LoggerService,

    private readonly analyticsService: AnalyticsService,
    private readonly analyticsExportService: AnalyticsExportService,
    private readonly businessAnalyticsService: BusinessAnalyticsService,
    private readonly tiktokService: TiktokService,
    private readonly twitterService: TwitterService,
    private readonly youtubeService: YoutubeService,
    private readonly instagramService: InstagramService,
  ) {}

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private appendPlatform(
    value: unknown,
    platform: string,
  ): Record<string, unknown> {
    return {
      ...this.readObjectRecord(value),
      platform,
    };
  }

  @Get('business')
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: () => 'analytics:business',
    tags: ['analytics', 'business'],
    ttl: 300,
  })
  async getBusinessAnalytics(@Req() req: ExpressRequest): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    const data = await this.businessAnalyticsService.getBusinessAnalytics();
    return serializeSingle(req, BusinessAnalyticsSerializer, data);
  }

  @Get('export')
  async exportData(
    @CurrentUser() user: User,
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Determine which organization to export data for
    let targetOrganizationId: string | undefined;

    if (getIsSuperAdmin(user)) {
      // Superadmins can export all data or filter by specific org
      targetOrganizationId = query.organizationId || undefined;
    } else {
      // Non-superadmins can only export their own organization's data
      if (!user.organizationId) {
        throw new ForbiddenException(
          'You must be part of an organization to export data',
        );
      }
      // If they try to export another org's data, deny access
      if (
        query.organizationId &&
        query.organizationId !== user.organizationId
      ) {
        throw new ForbiddenException(
          'You can only export data for your own organization',
        );
      }
      targetOrganizationId = user.organizationId;
    }

    // Default to CSV if no format specified
    const exportFormat = query.format === 'xlsx' ? 'xlsx' : 'csv';

    // Parse fields from comma-separated string or use default fields
    const exportFields = query.fields
      ? query.fields.split(',').map((field) => field.trim())
      : ['videoLabel', 'views', 'comments', 'likes', 'platform'];

    this.loggerService.log(url, {
      fields: exportFields,
      format: exportFormat,
      isSuperAdmin: getIsSuperAdmin(user),
      organizationId: targetOrganizationId,
    });

    const data = await this.analyticsExportService.exportData(
      exportFormat,
      exportFields,
      {
        brandId: query.brandId,
        endDate: query.endDate,
        organizationId: targetOrganizationId,
        platform: query.platform,
        postId: query.postId,
        startDate: query.startDate,
      },
    );

    const filename = targetOrganizationId
      ? `analytics-export-${targetOrganizationId}`
      : 'analytics-export-all';

    // The export body is org-supplied content echoed back verbatim. The
    // attachment disposition is what stops it rendering, so pin the declared
    // type as well rather than leaving a sniffing browser to reconsider.
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (exportFormat === 'csv') {
      response.setHeader('Content-Type', 'text/csv');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      response.setHeader('X-Analytics-Export-Limit', '5000');
      response.send(data);
    } else {
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.xlsx"`,
      );
      response.setHeader('X-Analytics-Export-Limit', '5000');
      response.send(data);
    }
  }

  @Get('trends')
  @Cache({
    tags: ['analytics', 'trends'],
    ttl: 600, // Cache for 10 minutes (trends change slowly)
  })
  async getTrends(@Req() req: ExpressRequest) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const safeFetchTrends = (
        fetcher: () => Promise<unknown[]>,
        label: string,
      ): Promise<unknown[]> =>
        fetcher().catch((err: unknown) => {
          this.loggerService.error(`${url} ${label} failed`, err);
          return [];
        });

      const [tiktokTrends, twitterTrends, youtubeTrends, instagramTrends] =
        await Promise.all([
          safeFetchTrends(() => this.tiktokService.getTrends(), 'tiktok'),
          safeFetchTrends(() => this.twitterService.getTrends(), 'twitter'),
          safeFetchTrends(() => this.youtubeService.getTrends(), 'youtube'),
          safeFetchTrends(() => this.instagramService.getTrends(), 'instagram'),
        ]);

      const trends = [
        ...tiktokTrends.map((trend) => this.appendPlatform(trend, 'tiktok')),
        ...twitterTrends.map((trend) => this.appendPlatform(trend, 'twitter')),
        ...youtubeTrends.map((trend) => this.appendPlatform(trend, 'youtube')),
        ...instagramTrends.map((trend) =>
          this.appendPlatform(trend, 'instagram'),
        ),
      ];
      return serializeSingle(req, AnalyticsTrendSerializer, trends);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return serializeSingle(req, AnalyticsTrendSerializer, []);
    }
  }

  @Get('timeseries')
  @Cache({
    keyGenerator: (req) =>
      `analytics:timeseries:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || ''}:${req.query?.endDate || ''}`,
    tags: ['analytics', 'timeseries'],
    ttl: 300, // Cache for 5 minutes
  })
  async getTimeSeries(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);

    // Default dates if not provided (7 days, ending yesterday)
    let finalStartDate = startDate;
    let finalEndDate = endDate;

    if (!finalStartDate || !finalEndDate) {
      // End date is yesterday (today's data is incomplete)
      const defaultEndDate = new Date();
      defaultEndDate.setDate(defaultEndDate.getDate() - 1);
      defaultEndDate.setHours(23, 59, 59, 999);

      // Start date is 7 days before end date
      const defaultStartDate = new Date(defaultEndDate);
      defaultStartDate.setDate(defaultStartDate.getDate() - 7);
      defaultStartDate.setHours(0, 0, 0, 0);

      finalStartDate =
        finalStartDate || defaultStartDate.toISOString().split('T')[0];
      finalEndDate = finalEndDate || defaultEndDate.toISOString().split('T')[0];
    }

    this.loggerService.log(url, {
      endDate: finalEndDate,
      startDate: finalStartDate,
    });

    const data = await this.analyticsService.getTimeSeriesData(
      finalStartDate,
      finalEndDate,
      organizationId,
    );

    return serializeSingle(
      req,
      AnalyticsTimeseriesWithPlatformsSerializer,
      data,
    );
  }

  @Get('overview')
  @Cache({
    keyGenerator: (req) =>
      `analytics:overview:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brandId || ''}`,
    tags: ['analytics', 'overview'],
    ttl: 300, // Cache for 5 minutes
  })
  async getOverview(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: AnalyticsDateRangeDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getOverview(
      query.startDate,
      query.endDate,
      query.brandId,
      organizationId,
    );
    return serializeSingle(req, AnalyticsOverviewSerializer, data);
  }

  @Get('top')
  @Cache({
    keyGenerator: (req) =>
      `analytics:top:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.metric || 'views'}:${req.query?.limit || '10'}:${req.query?.brandId || ''}:${req.query?.platform || ''}`,
    tags: ['analytics', 'top-content'],
    ttl: 300, // Cache for 5 minutes
  })
  async getTopContent(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: TopContentQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getTopContent(
      query.startDate,
      query.endDate,
      query.limit,
      query.metric,
      query.brandId,
      query.platform as CredentialPlatform,
      organizationId,
    );
    return serializeSingle(req, AnalyticsTopContentSerializer, data);
  }

  @Get('platforms')
  @Cache({
    keyGenerator: (req) =>
      `analytics:platforms:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brandId || ''}`,
    tags: ['analytics', 'platforms'],
    ttl: 300, // Cache for 5 minutes
  })
  async getPlatformComparison(
    @Req() req: ExpressRequest,
    @Query() query: AnalyticsDateRangeDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getPlatformComparison(
      query.startDate,
      query.endDate,
      query.brandId,
    );
    return serializeSingle(req, AnalyticsPlatformSerializer, data);
  }

  @Get('growth')
  @Cache({
    keyGenerator: (req) =>
      `analytics:growth:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.metric || 'views'}:${req.query?.brandId || ''}`,
    tags: ['analytics', 'growth'],
    ttl: 300, // Cache for 5 minutes
  })
  async getGrowthTrends(
    @Req() req: ExpressRequest,
    @Query() query: GrowthQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getGrowthTrends(
      query.startDate,
      query.endDate,
      query.metric,
      query.brandId,
    );
    return serializeSingle(req, AnalyticsGrowthSerializer, data);
  }

  @Get('engagement')
  @Cache({
    keyGenerator: (req) =>
      `analytics:engagement:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brandId || ''}:${req.query?.platform || ''}`,
    tags: ['analytics', 'engagement'],
    ttl: 300, // Cache for 5 minutes
  })
  async getEngagement(
    @Req() req: ExpressRequest,
    @Query() query: AnalyticsFilterQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getEngagementBreakdown(
      query.startDate,
      query.endDate,
      query.brandId,
      query.platform as CredentialPlatform,
    );
    return serializeSingle(req, AnalyticsEngagementSerializer, data);
  }

  @Get('hooks')
  @Cache({
    keyGenerator: (req) =>
      `analytics:hooks:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brandId || ''}`,
    tags: ['analytics', 'hooks'],
    ttl: 300, // Cache for 5 minutes
  })
  async getViralHooks(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: ViralHooksQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getViralHooks(
      query.startDate,
      query.endDate,
      query.brandId,
      organizationId,
    );
    return serializeSingle(req, AnalyticsHooksSerializer, data);
  }
}
