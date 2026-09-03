import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { AccountAnalyticsService } from '@api/endpoints/analytics/account-analytics.service';
import {
  buildAnalyticsCacheKey,
  resolveAnalyticsTenantScope,
  throwAnalyticsTenantForbidden,
} from '@api/endpoints/analytics/analytics-tenant-scope';
import {
  AccountAnalyticsQueryDto,
  AccountAnalyticsTopQueryDto,
  FleetEvaluationPolicyDto,
} from '@api/endpoints/analytics/dto/account-analytics-query.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  AccountAnalyticsDetailSerializer,
  AccountAnalyticsListSerializer,
  AccountAnalyticsTopSerializer,
  FleetEvaluationPolicySerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

@AutoSwagger()
@Controller('analytics')
@UseGuards(RolesGuard)
@UseInterceptors(RedisCacheInterceptor)
export class AccountAnalyticsController {
  constructor(
    private readonly accountAnalyticsService: AccountAnalyticsService,
    private readonly loggerService: LoggerService,
  ) {}

  private organizationId(user: User, request: ExpressRequest): string {
    const organizationId = resolveAnalyticsTenantScope(
      user,
      request,
    ).organizationId;
    if (!organizationId) {
      throwAnalyticsTenantForbidden();
    }
    return organizationId;
  }

  @Get('accounts')
  @Cache({
    keyGenerator: (req) =>
      buildAnalyticsCacheKey('accounts', req, [
        req.query?.startDate,
        req.query?.endDate,
        req.query?.brandId,
        req.query?.platform,
        req.query?.metric,
        req.query?.status,
        req.query?.search,
        req.query?.page,
        req.query?.limit,
        req.query?.direction,
      ]),
    tags: ['analytics', 'accounts'],
    ttl: 300,
  })
  async listAccounts(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: AccountAnalyticsQueryDto,
  ): Promise<unknown> {
    this.loggerService.log(
      `AccountAnalyticsController ${CallerUtil.getCallerName()}`,
    );
    const organizationId = this.organizationId(user, req);
    await this.accountAnalyticsService.assertBrandInScope(
      query.brandId,
      organizationId,
    );
    const data = await this.accountAnalyticsService.listAccounts(
      organizationId,
      query,
    );
    return serializeSingle(req, AccountAnalyticsListSerializer, data);
  }

  @Get('accounts/top')
  @Cache({
    keyGenerator: (req) =>
      buildAnalyticsCacheKey('accounts-top', req, [
        req.query?.startDate,
        req.query?.endDate,
        req.query?.brandId,
        req.query?.platform,
        req.query?.metric,
        req.query?.limit,
      ]),
    tags: ['analytics', 'accounts'],
    ttl: 300,
  })
  async topAccounts(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: AccountAnalyticsTopQueryDto,
  ): Promise<unknown> {
    const organizationId = this.organizationId(user, req);
    await this.accountAnalyticsService.assertBrandInScope(
      query.brandId,
      organizationId,
    );
    const data = await this.accountAnalyticsService.topAccounts(
      organizationId,
      query,
    );
    return serializeSingle(req, AccountAnalyticsTopSerializer, {
      accounts: data,
    });
  }

  @Get('accounts/:credentialId')
  @Cache({
    keyGenerator: (req) =>
      buildAnalyticsCacheKey('account-detail', req, [
        req.params?.credentialId,
        req.query?.startDate,
        req.query?.endDate,
        req.query?.brandId,
      ]),
    tags: ['analytics', 'accounts'],
    ttl: 300,
  })
  async getAccount(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Param('credentialId') credentialId: string,
    @Query() query: AccountAnalyticsQueryDto,
  ): Promise<unknown> {
    const organizationId = this.organizationId(user, req);
    await this.accountAnalyticsService.assertBrandInScope(
      query.brandId,
      organizationId,
    );
    const data = await this.accountAnalyticsService.getAccount(
      organizationId,
      credentialId,
      query,
    );
    if (!data) {
      throw new NotFoundException('Account analytics', credentialId);
    }
    return serializeSingle(req, AccountAnalyticsDetailSerializer, data);
  }

  @Get('fleet-evaluation-policy')
  async getPolicy(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query('brandId') brandId?: string,
  ): Promise<unknown> {
    const organizationId = this.organizationId(user, req);
    await this.accountAnalyticsService.assertBrandInScope(
      brandId,
      organizationId,
    );
    const data = await this.accountAnalyticsService.getPolicy(
      organizationId,
      brandId,
    );
    return serializeSingle(req, FleetEvaluationPolicySerializer, data ?? {});
  }

  @Patch('fleet-evaluation-policy')
  async savePolicy(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Body() body: FleetEvaluationPolicyDto,
  ): Promise<unknown> {
    const organizationId = this.organizationId(user, req);
    await this.accountAnalyticsService.assertBrandInScope(
      body.brandId,
      organizationId,
    );
    const data = await this.accountAnalyticsService.savePolicy(
      organizationId,
      {
        healthyMin: body.healthyMin,
        isEnabled: body.isEnabled,
        metric: body.metric,
        minPublishedPosts: body.minPublishedPosts,
        version: 1,
        watchMin: body.watchMin,
        windowWeeks: body.windowWeeks,
      },
      body.brandId,
    );
    return serializeSingle(req, FleetEvaluationPolicySerializer, data);
  }
}
