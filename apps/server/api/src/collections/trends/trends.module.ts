import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendCorpusFreshnessService } from '@api/collections/trends/services/modules/trend-corpus-freshness.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendPrelaunchCorpusService } from '@api/collections/trends/services/modules/trend-prelaunch-corpus.service';
import { TrendQueryService } from '@api/collections/trends/services/modules/trend-query.service';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendSourcePreviewService } from '@api/collections/trends/services/modules/trend-source-preview.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { TrendsWarmupService } from '@api/collections/trends/services/trends-warmup.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { XaiModule } from '@api/services/integrations/xai/xai.module';
import { ConfigModule } from '@libs/config/config.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TrendsController],
  exports: [
    TrendsService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
  ],
  imports: [
    forwardRef(() => ApifyModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ByokModule),
    forwardRef(() => CacheModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => LinkedInModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => XaiModule),
  ],
  providers: [
    TrendAnalysisService,
    TrendCorpusFreshnessService,
    TrendContentIdeasService,
    TrendFetchService,
    TrendFilteringService,
    TrendPreferencesService,
    TrendPrelaunchCorpusService,
    TrendQueryService,
    TrendReferenceCorpusService,
    TrendSourceItemsService,
    TrendSourcePreviewService,
    TrendVideoService,
    TrendsService,
    TrendsWarmupService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class TrendsModule {}
