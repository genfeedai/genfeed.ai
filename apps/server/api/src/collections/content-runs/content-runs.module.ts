import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { BrandRemixGenerationController } from '@api/collections/content-runs/controllers/brand-remix-generation.controller';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { BrandRemixGenerationService } from '@api/collections/content-runs/services/brand-remix-generation.service';
import { BrandRemixPersonaResolutionService } from '@api/collections/content-runs/services/brand-remix-persona-resolution.service';
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
import { BrandRemixSceneService } from '@api/collections/content-runs/services/brand-remix-scene.service';
import { BrandRemixSceneAnalysisService } from '@api/collections/content-runs/services/brand-remix-scene-analysis.service';
import { BrandRemixSceneAssemblyService } from '@api/collections/content-runs/services/brand-remix-scene-assembly.service';
import { BrandRemixSceneBillingService } from '@api/collections/content-runs/services/brand-remix-scene-billing.service';
import { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import { BrandRemixSceneQuoteService } from '@api/collections/content-runs/services/brand-remix-scene-quote.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { BrandRemixSceneWorkflowService } from '@api/collections/content-runs/services/brand-remix-scene-workflow.service';
import { BrandRemixSourceMediaService } from '@api/collections/content-runs/services/brand-remix-source-media.service';
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
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { XAdsModule } from '@api/services/integrations/x-ads/x-ads.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { RouterModule } from '@api/services/router/router.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BrandRemixGenerationController, ContentRunsController],
  exports: [
    BrandRemixSceneService,
    BrandRemixRunsService,
    ContentRunsService,
    ContentRunRecommendationsService,
  ],
  imports: [
    FileQueueModule,
    MediaUrlsModule,
    RouterModule,
    OpenRouterModule,
    WhisperModule,
    AdsResearchModule,
    AdCreativeMappingsModule,
    BatchGenerationModule,
    BrandsCoreModule,
    ByokModule,
    ContentIntelligenceModule,
    CreditsModule,
    ContentOptimizationModule,
    FilesClientModule,
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
    AgentGenerationEstimateService,
    BrandRemixSceneService,
    BrandRemixSceneStoreService,
    BrandRemixSceneQuoteService,
    BrandRemixSceneSourceService,
    BrandRemixSceneWorkflowService,
    BrandRemixSceneAnalysisService,
    BrandRemixSceneGenerationService,
    BrandRemixSceneAssemblyService,
    BrandRemixSceneBillingService,
    BrandRemixPersonaResolutionService,
    BrandRemixSourceResolverService,
    BrandRemixSourceMediaService,
    BrandRemixRunPlanningService,
    BrandRemixRunPersistenceService,
    BrandRemixRunStateService,
    BrandRemixRunProviderDispatchService,
    BrandRemixGenerationService,
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
