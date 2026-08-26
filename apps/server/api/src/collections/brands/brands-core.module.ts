import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { SkillsCoreModule } from '@api/collections/skills/skills-core.module';
import { CommonModule } from '@api/common/common.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { Module } from '@nestjs/common';

/**
 * Brand persistence and kit primitives. Media/workflow HTTP modules import this
 * instead of BrandsModule so they do not close a collection ring.
 * Prompt generation and scrape-persist stay on BrandsModule — they need
 * Credits/Models/Replicate and Links/Organizations, which are not leaves.
 */
@Module({
  exports: [
    BrandScraperModule,
    BrandsService,
    DefaultRecurringContentService,
    BrandDataMapper,
    BrandOsPreviewService,
  ],
  imports: [
    CommonModule,
    BrandScraperModule,
    FilesClientModule,
    LlmDispatcherModule,
    SkillsCoreModule,
  ],
  providers: [
    BrandsService,
    DefaultRecurringContentService,
    BrandGenerationService,
    BrandKitAssetsService,
    BrandKitDraftService,
    BrandOsPreviewService,
    BrandRelocationService,
    BrandDataMapper,
  ],
})
export class BrandsCoreModule {}
