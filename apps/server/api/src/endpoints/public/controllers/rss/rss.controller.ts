import { RssService } from '@api/endpoints/public/services/rss.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Param } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('public/rss')
export class PublicRSSController {
  constructor(private readonly rssService: RssService) {}

  /**
   * Global RSS feed - all public published articles
   * GET /rss/articles
   */
  @Get('articles')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  getGlobalFeed(): Promise<string> {
    return this.rssService.generateGlobalFeed();
  }

  /**
   * User RSS feed - specific user's public published articles
   * GET /rss/users/:userId
   */
  @Get('users/:userId')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  getUserFeed(@Param('userId') userId: string): Promise<string> {
    return this.rssService.generateUserFeed(userId);
  }

  /**
   * Brand RSS feed - specific brand's public published articles
   * GET /rss/brands/:brandId
   */
  @Get('brands/:brandId')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  getBrandFeed(@Param('brandId') brandId: string): Promise<string> {
    return this.rssService.generateBrandFeed(brandId);
  }

  /**
   * Organization RSS feed - specific organization's public published articles
   * GET /rss/organizations/:organizationId
   */
  @Get('organizations/:organizationId')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  getOrganizationFeed(
    @Param('organizationId') organizationId: string,
  ): Promise<string> {
    return this.rssService.generateOrganizationFeed(organizationId);
  }
}
