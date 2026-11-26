import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { ApifyAdsService } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyLinkedInService } from '@api/services/integrations/apify/services/modules/apify-linkedin.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import { ResearchAccessModule } from '@api/services/research-access/research-access.module';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ApifyService, {
  additionalExports: [ApifyAdsService],
  additionalImports: [
    ActivityRecordingModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    ByokModule,
    ResearchAccessModule,
  ],
  additionalProviders: [
    ApifyAdsService,
    ResearchCollectionRunner,
    ApifyBaseService,
    ApifyTikTokService,
    ApifyInstagramService,
    ApifyTwitterService,
    ApifyYouTubeService,
    ApifyLinkedInService,
  ],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ApifyModule {}
