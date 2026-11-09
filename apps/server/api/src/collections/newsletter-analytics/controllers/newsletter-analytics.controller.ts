import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { NewsletterAnalyticsQueryDto } from '@api/collections/newsletter-analytics/dto/newsletter-analytics-query.dto';
import { NewsletterAnalyticsService } from '@api/collections/newsletter-analytics/services/newsletter-analytics.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { INewsletterAnalytics } from '@genfeedai/contracts/interfaces';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/** The Newsletter Analytics page (#9727). */
@AutoSwagger()
@ApiTags('Newsletters')
@Controller('brands/:brandId/newsletter/analytics')
@UseGuards(RolesGuard)
@OrganizationModule('publishing')
export class NewsletterAnalyticsController {
  constructor(private readonly analytics: NewsletterAnalyticsService) {}

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: NewsletterAnalyticsQueryDto,
  ): Promise<{ data: INewsletterAnalytics }> {
    return { data: await this.analytics.get(user, brandId, query) };
  }
}
