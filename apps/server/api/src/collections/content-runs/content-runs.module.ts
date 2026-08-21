import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import {
  BRAND_REMIX_RUNTIME,
  systemBrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { ImagesModule } from '@api/collections/images/images.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
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
    BatchGenerationModule,
    BrandsCoreModule,
    ContentOptimizationModule,
    ImagesModule,
    OrganizationSettingsModule,
    TrendsModule,
    VideoGenerationModule,
    VideosModule,
  ],
  providers: [
    BrandRemixRunsService,
    ContentRunsService,
    ContentRunRecommendationsService,
    { provide: BRAND_REMIX_RUNTIME, useValue: systemBrandRemixRuntime },
  ],
})
export class ContentRunsModule {}
