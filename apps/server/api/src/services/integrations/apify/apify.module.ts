import { ByokModule } from '@api/services/byok/byok.module';
import { ApifyService } from '@server/services/integrations/apify/services/apify.service';
import { ApifyAdsService } from '@server/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyBaseService } from '@server/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@server/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyPinterestService } from '@server/services/integrations/apify/services/modules/apify-pinterest.service';
import { ApifyRedditService } from '@server/services/integrations/apify/services/modules/apify-reddit.service';
import { ApifyRunBudgetService } from '@server/services/integrations/apify/services/modules/apify-run-budget.service';
import { ApifyTikTokService } from '@server/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@server/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@server/services/integrations/apify/services/modules/apify-youtube.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ApifyService, {
  additionalExports: [ApifyAdsService],
  additionalImports: [HttpModule, ByokModule],
  additionalProviders: [
    ApifyAdsService,
    ApifyRunBudgetService,
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
