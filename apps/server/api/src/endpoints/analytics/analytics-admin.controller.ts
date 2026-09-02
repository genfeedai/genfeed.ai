import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import {
  AdminBrandsQueryDto,
  AdminOrgsQueryDto,
  LeaderboardQueryDto,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  AnalyticSerializer,
  AnalyticsBrandLeaderboardSerializer,
  AnalyticsBrandStatsSerializer,
  AnalyticsOrgLeaderboardSerializer,
  AnalyticsOrgStatsSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

@AutoSwagger()
@Controller('analytics')
@UseGuards(RolesGuard)
@UseInterceptors(RedisCacheInterceptor)
export class AnalyticsAdminController {
  private readonly constructorName = 'AnalyticsController';

  constructor(
    private readonly loggerService: LoggerService,
    private readonly summaryService: AnalyticsAdminSummaryService,
    private readonly entityLeaderboardService: EntityLeaderboardService,
  ) {}

  @Get()
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: (req) =>
      `analytics:super-admin:${req.user?.id ?? 'anonymous'}`,
    tags: ['analytics', 'super-admin'],
    ttl: 300,
  })
  @ApiOperation({
    operationId: 'AnalyticsController.findAll',
    summary: 'findAll',
  })
  async findAll(
    @Req() req: ExpressRequest,
    @Query() query: BaseQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.summaryService.getSummary(query);
    return serializeSingle(req, AnalyticSerializer, data);
  }

  @Get('organizations/leaderboard')
  @RolesDecorator('superadmin')
  @Cache({
    keyGenerator: (req) =>
      `analytics:leaderboard:${req.query?.startDate || 'default'}:${req.query?.endDate || 'default'}:${req.query?.sort || 'engagement'}:${req.query?.limit || '10'}`,
    tags: ['analytics', 'super-admin', 'leaderboard'],
    ttl: 300,
  })
  @ApiOperation({
    operationId: 'AnalyticsController.getOrganizationsLeaderboard',
    summary: 'getOrganizationsLeaderboard',
  })
  async getOrganizationsLeaderboard(
    @Req() req: ExpressRequest,
    @Query() query: LeaderboardQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data =
      await this.entityLeaderboardService.getOrganizationsLeaderboard(
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
    ttl: 300,
  })
  @ApiOperation({
    operationId: 'AnalyticsController.getOrganizationsWithStats',
    summary: 'getOrganizationsWithStats',
  })
  async getOrganizationsWithStats(
    @Req() req: ExpressRequest,
    @Query() query: AdminOrgsQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const data = await this.entityLeaderboardService.getOrganizationsWithStats(
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
    ttl: 300,
  })
  @ApiOperation({
    operationId: 'AnalyticsController.getBrandsLeaderboard',
    summary: 'getBrandsLeaderboard',
  })
  async getBrandsLeaderboard(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: LeaderboardQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.entityLeaderboardService.getBrandsLeaderboard(
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
    ttl: 300,
  })
  @ApiOperation({
    operationId: 'AnalyticsController.getBrandsWithStats',
    summary: 'getBrandsWithStats',
  })
  async getBrandsWithStats(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: AdminBrandsQueryDto,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = this.getScopedOrganizationId(user);
    this.loggerService.log(url, { query });

    const data = await this.entityLeaderboardService.getBrandsWithStats(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.sort,
      organizationId,
    );
    return serializeSingle(req, AnalyticsBrandStatsSerializer, data);
  }

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
}
