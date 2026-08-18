import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CommonModule } from '@api/common/common.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { Module } from '@nestjs/common';

/**
 * Brand persistence and kit primitives. Media/workflow HTTP modules import this
 * instead of BrandsModule so they do not close a collection ring.
 */
@Module({
  exports: [
    BrandsService,
    DefaultRecurringContentService,
    BrandDataMapper,
    BrandPersistenceService,
    MasterPromptGeneratorService,
  ],
  imports: [
    CommonModule,
    BrandScraperModule,
    FilesClientModule,
    LlmDispatcherModule,
  ],
  providers: [
    BrandsService,
    DefaultRecurringContentService,
    BrandGenerationService,
    BrandKitAssetsService,
    BrandKitDraftService,
    BrandPersistenceService,
    BrandRelocationService,
    BrandDataMapper,
    MasterPromptGeneratorService,
  ],
})
export class BrandsCoreModule {}
