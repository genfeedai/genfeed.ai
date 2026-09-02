import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { BrandRemixRunExecutionService } from '@api/collections/content-runs/services/brand-remix-run-execution.service';
import { BrandRemixRunPaidDraftService } from '@api/collections/content-runs/services/brand-remix-run-paid-draft.service';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixRunProviderDispatchService } from '@api/collections/content-runs/services/brand-remix-run-provider-dispatch.service';
import { BrandRemixRunReviewService } from '@api/collections/content-runs/services/brand-remix-run-review.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import {
  BRAND_REMIX_RUNTIME,
  systemBrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { PausedMetaCampaignDraftService } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import { PausedXAdsCampaignDraftService } from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { XAdsModule } from '@api/services/integrations/x-ads/x-ads.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentRunsController],
  exports: [
    BrandRemixRunsService,
    ContentRunsService,
    ContentRunRecommendationsService,
  ],
  imports: [
    AdsResearchModule,
    AdCreativeMappingsModule,
    BatchGenerationModule,
    BrandsCoreModule,
    ByokModule,
    ContentIntelligenceModule,
    CreditsModule,
    ContentOptimizationModule,
    ImagesModule,
    MetaAdsModule,
    ModelsModule,
    OrganizationSettingsModule,
    TrendsModule,
    VideoGenerationModule,
    VideosModule,
    WorkflowsCoreModule,
    XAdsModule,
  ],
  providers: [
    BrandRemixSourceResolverService,
    BrandRemixRunPlanningService,
    BrandRemixRunPersistenceService,
    BrandRemixRunStateService,
    BrandRemixRunProviderDispatchService,
    BrandRemixRunExecutionService,
    BrandRemixRunReviewService,
    BrandRemixRunPaidDraftService,
    BrandRemixRunsService,
    ContentRunsService,
    ContentRunRecommendationsService,
    CreditsGuard,
    CreditsInterceptor,
    PausedMetaCampaignDraftService,
    PausedXAdsCampaignDraftService,
    { provide: BRAND_REMIX_RUNTIME, useValue: systemBrandRemixRuntime },
  ],
})
export class ContentRunsModule {}
