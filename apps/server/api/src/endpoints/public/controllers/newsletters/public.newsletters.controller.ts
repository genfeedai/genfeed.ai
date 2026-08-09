import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Param } from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('public/newsletters')
export class PublicNewslettersController {
  constructor(
    private readonly newsletterImportFeedService: NewsletterImportFeedService,
  ) {}

  @Get(':newsletterId')
  @Header('Cache-Control', 'public, max-age=600')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Cache({
    keyGenerator: (req) =>
      `public:newsletter:${req.params?.newsletterId ?? 'unknown'}`,
    tags: ['newsletters', 'public'],
    ttl: 600,
  })
  getCanonicalNewsletterPage(
    @Param('newsletterId') newsletterId: string,
  ): Promise<string> {
    return this.newsletterImportFeedService.generateCanonicalPage(newsletterId);
  }
}
