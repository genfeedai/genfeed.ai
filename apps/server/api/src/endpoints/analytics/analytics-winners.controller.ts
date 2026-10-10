import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WinnerClassificationService } from '@api/collections/outliers/services/winner-classification.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { resolveOwnedAnalyticsTenantScope } from '@api/endpoints/analytics/analytics-tenant-scope';
import { WinnerPostsQueryDto } from '@api/endpoints/analytics/dto/winner-posts-query.dto';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AnalyticsWinnerPostSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

/**
 * #5502 own posts that beat their account baseline on any signal, with the
 * evidence that qualified them. Analytics Posts uses it as the Winners filter.
 */
@AutoSwagger()
@FeatureFlag('analytics')
@OrganizationModule('analytics')
@Controller('analytics')
@UseGuards(RolesGuard)
export class AnalyticsWinnersController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly winnerClassificationService: WinnerClassificationService,
  ) {}

  @Get('winners')
  async findWinners(
    @CurrentUser() user: User,
    @Req() req: ExpressRequest,
    @Query() query: WinnerPostsQueryDto,
  ): Promise<unknown> {
    const organizationId = resolveOwnedAnalyticsTenantScope(user, req);
    await this.analyticsService.assertBrandInScope(
      query.brandId,
      organizationId,
    );
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      query.startDate,
      query.endDate,
    );

    const winners = await this.winnerClassificationService.findWinners({
      brandId: query.brandId,
      limit: query.limit,
      organizationId,
      platform: query.platform,
      publishedFrom: startDate,
      publishedTo: endDate,
    });
    return serializeSingle(req, AnalyticsWinnerPostSerializer, winners);
  }
}
