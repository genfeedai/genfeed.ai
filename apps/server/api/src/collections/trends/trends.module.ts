import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsAnalyticsController } from '@api/collections/trends/controllers/trends-analytics.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { XaiModule } from '@api/services/integrations/xai/xai.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { TrendAnalysisService } from '@server/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@server/collections/trends/services/modules/trend-content-ideas.service';
import { TrendCorpusFreshnessService } from '@server/collections/trends/services/modules/trend-corpus-freshness.service';
import { TrendFetchService } from '@server/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@server/collections/trends/services/modules/trend-filtering.service';
import { TrendQueryService } from '@server/collections/trends/services/modules/trend-query.service';
import { TrendReferenceSyncService } from '@server/collections/trends/services/modules/trend-reference-sync.service';
import { TrendSourceItemsService } from '@server/collections/trends/services/modules/trend-source-items.service';
import { TrendSourcePreviewService } from '@server/collections/trends/services/modules/trend-source-preview.service';
import { TrendVideoService } from '@server/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@server/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@server/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import { CacheModule } from '@server/services/cache/cache.module';

@Module({
  controllers: [
    TrendsAnalyticsController,
    TrendsDiscoveryController,
    TrendsController,
  ],
  exports: [
    TrendsService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
  ],
  imports: [
    ApifyModule,
    BrandsCoreModule,
    ByokModule,
    CacheModule,
    ConfigModule,
    CreditsModule,
    CredentialsCoreModule,
    InstagramModule,
    LinkedInModule,
    ModelsModule,
    PinterestModule,
    RedditModule,
    ReplicateModule,
    TiktokModule,
    TwitterModule,
    XaiModule,
    YoutubeModule,
  ],
  providers: [
    TrendAnalysisService,
    TrendCorpusFreshnessService,
    TrendContentIdeasService,
    TrendFetchService,
    TrendFilteringService,
    TrendPreferencesService,
    TrendQueryService,
    TrendReferenceCorpusService,
    TrendReferenceSyncService,
    TrendSourceItemsService,
    TrendSourcePreviewService,
    TrendVideoService,
    TrendsService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class TrendsModule {}
