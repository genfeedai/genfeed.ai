import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Param } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('public/rss')
export class PublicRSSController {
  constructor(
    private readonly rssService: RssService,
    private readonly newsletterImportFeedService: NewsletterImportFeedService,
  ) {}

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
   * Import-ready newsletter archive for generic RSS importers such as Substack.
   * This is a feed surface, not a schedulable publishing adapter.
   */
  @Get('brands/:brandId/newsletters')
  @Header('Cache-Control', 'public, max-age=600')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Cache({
    keyGenerator: (req) =>
      `public:rss:brand:${req.params?.brandId ?? 'unknown'}:newsletters`,
    tags: ['newsletters', 'public'],
    ttl: 600,
  })
  getBrandNewsletterFeed(@Param('brandId') brandId: string): Promise<string> {
    return this.newsletterImportFeedService.generateBrandFeed(brandId);
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
