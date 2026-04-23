import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import {
  AdminBrandsQueryDto,
  AdminOrgsQueryDto,
  AnalyticsDateRangeDto,
  AnalyticsFilterQueryDto,
  GrowthQueryDto,
  LeaderboardQueryDto,
  TopContentQueryDto,
  ViralHooksQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { AnalyticEntity } from '@api/endpoints/analytics/entities/analytics.entity';
import {
  OrgLeaderboardItemEntity,
  PaginatedBrandsResponse,
  PaginatedOrgsResponse,
} from '@api/endpoints/analytics/entities/organization-leaderboard.entity';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import type { User } from '@clerk/backend';
import {
  CredentialPlatform,
  IngredientCategory,
  PostStatus,
  WorkflowStatus,
} from '@genfeedai/enums';
import {
  AnalyticSerializer,
  AnalyticsBrandLeaderboardSerializer,
  AnalyticsBrandStatsSerializer,
  AnalyticsEngagementSerializer,
  AnalyticsGrowthSerializer,
  AnalyticsHooksSerializer,
  AnalyticsOrgLeaderboardSerializer,
  AnalyticsOrgStatsSerializer,
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

    const publicMetadata = getPublicMetadata(user);
    if (!publicMetadata.organization) {
      throw new ForbiddenException(
        'You must be part of an organization to access analytics',
      );
    }

    return publicMetadata.organization;
  }

  constructor(
    private readonly loggerService: LoggerService,

    private readonly analyticsService: AnalyticsService,
    private readonly businessAnalyticsService: BusinessAnalyticsService,
    private readonly botsService: BotsService,
    private readonly brandsService: BrandsService,
    readonly _creditTransactionsService: CreditTransactionsService,
    private readonly ingredientsService: IngredientsService,
    private readonly modelsService: ModelsService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
    private readonly workflowsService: WorkflowsService,
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

  @Get()
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: (req) =>
      `analytics:super-admin:${req.user?.id ?? 'anonymous'}`,
    tags: ['analytics', 'super-admin'],
    ttl: 300, // Cache for 5 minutes
  })
  async findAll(
    @Req() req: ExpressRequest,
    @Query() query: BaseQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Get super admin analytics
    const [
      totalSubscriptions,
      totalUsers,
      totalPosts,
      totalBrands,
      totalVideos,
      totalImages,
      totalOrganizations,
      activeWorkflows,
      activeBots,
      totalModels,
      pendingPosts,
    ] = await Promise.all([
      this.subscriptionsService.findAll([{ $count: 'total' }], options),
      this.usersService.findAll([{ $count: 'total' }], options),
      this.postsService.findAll([{ $count: 'total' }], options),
      this.brandsService.findAll([{ $count: 'total' }], options),
      this.ingredientsService.findAll(
        [
          { $match: { category: IngredientCategory.VIDEO } },
          { $count: 'total' },
        ],
        options,
      ),
      this.ingredientsService.findAll(
        [
          { $match: { category: IngredientCategory.IMAGE } },
          { $count: 'total' },
        ],
        options,
      ),
      this.organizationsService.findAll(
        [{ $match: { isDeleted: false } }, { $count: 'total' }],
        options,
      ),
      this.workflowsService.findAll(
        [
          { $match: { isDeleted: false, status: WorkflowStatus.ACTIVE } },
          { $count: 'total' },
        ],
        options,
      ),
      this.botsService.findAll(
        [{ $match: { enabled: true, isDeleted: false } }, { $count: 'total' }],
        options,
      ),
      this.modelsService.findAll(
        [{ $match: { isDeleted: false } }, { $count: 'total' }],
        options,
      ),
      this.postsService.findAll(
        [
          { $match: { isDeleted: false, status: PostStatus.PENDING } },
          { $count: 'total' },
        ],
        options,
      ),
    ]);

    // Extract count from paginated results - the total property contains the count
    const extractTotal = (result: unknown): number =>
      (result as Record<string, number>)?.total || 0;

    const flattenedData = {
      activeBots: extractTotal(activeBots),
      activeWorkflows: extractTotal(activeWorkflows),
      monthlyGrowth: 0,
      pendingPosts: extractTotal(pendingPosts),
      recentActivities: 0,
      totalBrands: extractTotal(totalBrands),
      totalCredentialsConnected: 0,
      totalCredits: 0,
      totalImages: extractTotal(totalImages),
      totalModels: extractTotal(totalModels),
      totalOrganizations: extractTotal(totalOrganizations),
      totalPosts: extractTotal(totalPosts),
      totalSubscriptions: extractTotal(totalSubscriptions),
      totalUsers: extractTotal(totalUsers),
      totalVideos: extractTotal(totalVideos),
      totalViews: 0,
      viewsGrowth: 0,
    };

    return serializeSingle(req, AnalyticSerializer, flattenedData);
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
    @Query('format') format: string,
    @Query('fields') fields: string,
    @Query('organization') organizationId: string,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    // Determine which organization to export data for
    let targetOrganizationId: string | undefined;

    if (getIsSuperAdmin(user)) {
      // Superadmins can export all data or filter by specific org
      targetOrganizationId = organizationId || undefined;
    } else {
      // Non-superadmins can only export their own organization's data
      if (!publicMetadata.organization) {
        throw new ForbiddenException(
          'You must be part of an organization to export data',
        );
      }
      // If they try to export another org's data, deny access
      if (organizationId && organizationId !== publicMetadata.organization) {
        throw new ForbiddenException(
          'You can only export data for your own organization',
        );
      }
      targetOrganizationId = publicMetadata.organization;
    }

    // Default to CSV if no format specified
    const exportFormat = format === 'xlsx' ? 'xlsx' : 'csv';

    // Parse fields from comma-separated string or use default fields
    const exportFields = fields
      ? fields.split(',').map((field) => field.trim())
      : ['videoLabel', 'views', 'comments', 'likes', 'platform'];

    this.loggerService.log(url, {
      fields: exportFields,
      format: exportFormat,
      isSuperAdmin: getIsSuperAdmin(user),
      organizationId: targetOrganizationId,
    });

    const data = await this.analyticsService.exportData(
      exportFormat,
      exportFields,
      targetOrganizationId,
    );

    const filename = targetOrganizationId
      ? `analytics-export-${targetOrganizationId}`
      : 'analytics-export-all';

    if (exportFormat === 'csv') {
      response.setHeader('Content-Type', 'text/csv');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
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
          // @ts-expect-error TS2739
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

  @Get('organizations/leaderboard')
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: (req) =>
      `analytics:leaderboard:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.sort || 'engagement'}:${req.query?.limit || '10'}`,
    tags: ['analytics', 'super-admin', 'leaderboard'],
    ttl: 300, // Cache for 5 minutes
  })
  async getOrganizationsLeaderboard(
    @Req() req: ExpressRequest,
    @Query() query: LeaderboardQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getOrganizationsLeaderboard(
      query.startDate,
      query.endDate,
      query.sort,
      query.limit,
    );
    return serializeSingle(req, AnalyticsOrgLeaderboardSerializer, data);
  }

  @Get('organizations')
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: (req) =>
      `analytics:orgs:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.page || '1'}:${req.query?.limit || '20'}:${req.query?.sort || 'engagement'}`,
    tags: ['analytics', 'super-admin', 'organizations'],
    ttl: 300, // Cache for 5 minutes
  })
  async getOrganizationsWithStats(
    @Req() req: ExpressRequest,
    @Query() query: AdminOrgsQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getOrganizationsWithStats(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.sort,
    );
    return serializeSingle(req, AnalyticsOrgStatsSerializer, data);
  }

  @Get('brands/leaderboard')
  @Cache({
    keyGenerator: (req) =>
      `analytics:brands-leaderboard:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.sort || 'engagement'}:${req.query?.limit || '10'}`,
    tags: ['analytics', 'brands-leaderboard'],
    ttl: 300, // Cache for 5 minutes
  })
  async getBrandsLeaderboard(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: LeaderboardQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getBrandsLeaderboard(
      query.startDate,
      query.endDate,
      query.sort,
      query.limit,
      organizationId,
    );
    return serializeSingle(req, AnalyticsBrandLeaderboardSerializer, data);
  }

  @Get('brands')
  @Cache({
    keyGenerator: (req) =>
      `analytics:brands:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.page || '1'}:${req.query?.limit || '20'}:${req.query?.sort || 'engagement'}`,
    tags: ['analytics', 'brands'],
    ttl: 300, // Cache for 5 minutes
  })
  async getBrandsWithStats(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: AdminBrandsQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getBrandsWithStats(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.sort,
      organizationId,
    );
    return serializeSingle(req, AnalyticsBrandStatsSerializer, data);
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
      `analytics:overview:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brand || ''}`,
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
      query.brand,
      organizationId,
    );
    return serializeSingle(req, AnalyticsOverviewSerializer, data);
  }

  @Get('top')
  @Cache({
    keyGenerator: (req) =>
      `analytics:top:${req.user?.id ?? 'anonymous'}:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.metric || 'views'}:${req.query?.limit || '10'}:${req.query?.brand || ''}:${req.query?.platform || ''}`,
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
      query.brand,
      query.platform as CredentialPlatform,
      organizationId,
    );
    return serializeSingle(req, AnalyticsTopContentSerializer, data);
  }

  @Get('platforms')
  @Cache({
    keyGenerator: (req) =>
      `analytics:platforms:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brand || ''}`,
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
      query.brand,
    );
    return serializeSingle(req, AnalyticsPlatformSerializer, data);
  }

  @Get('growth')
  @Cache({
    keyGenerator: (req) =>
      `analytics:growth:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.metric || 'views'}:${req.query?.brand || ''}`,
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
      query.brand,
    );
    return serializeSingle(req, AnalyticsGrowthSerializer, data);
  }

  @Get('engagement')
  @Cache({
    keyGenerator: (req) =>
      `analytics:engagement:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brand || ''}:${req.query?.platform || ''}`,
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
      query.brand,
      query.platform as CredentialPlatform,
    );
    return serializeSingle(req, AnalyticsEngagementSerializer, data);
  }

  @Get('hooks')
  @Cache({
    keyGenerator: (req) =>
      `analytics:hooks:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.brand || ''}:${req.query?.organization || ''}`,
    tags: ['analytics', 'hooks'],
    ttl: 300, // Cache for 5 minutes
  })
  async getViralHooks(
    @Req() req: ExpressRequest,
    @Query() query: ViralHooksQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.analyticsService.getViralHooks(
      query.startDate,
      query.endDate,
      query.brand,
      query.organization,
    );
    return serializeSingle(req, AnalyticsHooksSerializer, data);
  }
}
