import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { TrendsWarmupService } from '@api/collections/trends/services/trends-warmup.service';
import { ConfigModule } from '@api/config/config.module';
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
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TrendsController],
  exports: [
    TrendsService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
  ],
  imports: [
    ApifyModule,
    forwardRef(() => BrandsModule),
    ByokModule,
    CacheModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    CredentialsModule,
    InstagramModule,
    LinkedInModule,
    forwardRef(() => ModelsModule),
    ReplicateModule,
    TiktokModule,
    TwitterModule,
    XaiModule,
  ],
  providers: [
    TrendAnalysisService,
    TrendContentIdeasService,
    TrendFetchService,
    TrendFilteringService,
    TrendPreferencesService,
    TrendReferenceCorpusService,
    TrendVideoService,
    TrendsService,
    TrendsWarmupService,
    CreditsGuard,
    CreditsInterceptor,
  ],
})
export class TrendsModule {}
