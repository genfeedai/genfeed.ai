import { ByokModule } from '@api/services/byok/byok.module';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyPinterestService } from '@api/services/integrations/apify/services/modules/apify-pinterest.service';
import { ApifyRedditService } from '@api/services/integrations/apify/services/modules/apify-reddit.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ApifyService, {
  additionalImports: [HttpModule, ByokModule],
  additionalProviders: [
    ApifyBaseService,
    ApifyTikTokService,
    ApifyInstagramService,
    ApifyTwitterService,
    ApifyYouTubeService,
    ApifyRedditService,
    ApifyPinterestService,
  ],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ApifyModule {}
