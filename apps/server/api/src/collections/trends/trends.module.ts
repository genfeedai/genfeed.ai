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
import { LoggerService } from '@libs/logger/logger.service';
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
import { CacheService } from '@server/services/cache/cache.service';
import { ApifyService } from '@server/services/integrations/apify/services/apify.service';
import { InstagramService } from '@server/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@server/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@server/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@server/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { XaiService } from '@server/services/integrations/xai/services/xai.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

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
    {
      inject: [
        PrismaService,
        LoggerService,
        CacheService,
        ApifyService,
        InstagramService,
        LinkedInService,
        XaiService,
        TwitterService,
        RedditService,
        YoutubeService,
        PinterestService,
        TiktokService,
      ],
      provide: TrendFetchService,
      useFactory: (
        prisma: PrismaService,
        loggerService: LoggerService,
        cacheService: CacheService,
        apifyService: ApifyService,
        instagramService: InstagramService,
        linkedinService: LinkedInService,
        xaiService: XaiService,
        twitterService: TwitterService,
        redditService: RedditService,
        youtubeService: YoutubeService,
        pinterestService: PinterestService,
        tiktokService: TiktokService,
      ) =>
        new TrendFetchService(
          prisma,
          loggerService,
          cacheService,
          apifyService,
          instagramService,
          linkedinService,
          xaiService,
          twitterService,
          redditService,
          youtubeService,
          pinterestService,
          tiktokService,
        ),
    },
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
