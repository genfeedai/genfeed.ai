import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticleTrafficQueryDto } from '@api/collections/articles/dto/article-traffic-query.dto';
import { ArticleTrafficService } from '@api/collections/articles/services/article-traffic.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { ArticleTraffic } from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

@AutoSwagger()
@Controller('articles')
@UseGuards(RolesGuard)
export class ArticlesTrafficController {
  constructor(private readonly trafficService: ArticleTrafficService) {}

  @TenantReadPolicy('selected')
  @Get(':articleId/website-traffic')
  getTraffic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('articleId') articleId: string,
    @Query() query: ArticleTrafficQueryDto,
  ): Promise<ArticleTraffic> {
    const readScope = resolveTenantReadScope(user);
    return this.trafficService.getTraffic({
      articleId,
      brandId: readScope.brandId,
      organizationId: readScope.organizationId,
      period: query.period,
      userId: user.userId ?? user.id,
    });
  }
}
