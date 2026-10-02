import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticleTrafficQueryDto } from '@api/collections/articles/dto/article-traffic-query.dto';
import { ArticleTrafficService } from '@api/collections/articles/services/article-traffic.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { ArticleTraffic } from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

@AutoSwagger()
@Controller('articles')
@UseGuards(RolesGuard)
export class ArticlesTrafficController {
  constructor(private readonly trafficService: ArticleTrafficService) {}

  @Get(':articleId/website-traffic')
  getTraffic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('articleId') articleId: string,
    @Query() query: ArticleTrafficQueryDto,
  ): Promise<ArticleTraffic> {
    return this.trafficService.getTraffic({
      articleId,
      brandId: user.brandId,
      organizationId: user.organizationId,
      period: query.period,
      userId: user.userId ?? user.id,
    });
  }
}
