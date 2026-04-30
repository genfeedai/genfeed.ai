/**
 * Content Intelligence Module
 * AI-powered content analysis and generation: creator scraping, pattern extraction,
 * playbook building, and pattern-based content generation.
 */

import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreatorsController } from '@api/collections/content-intelligence/controllers/creators.controller';
import { GenerateController } from '@api/collections/content-intelligence/controllers/generate.controller';
import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import { PlaybooksController } from '@api/collections/content-intelligence/controllers/playbooks.controller';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { CreatorScraperService } from '@api/collections/content-intelligence/services/creator-scraper.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    CreatorsController,
    GenerateController,
    PatternsController,
    PlaybooksController,
  ],
  exports: [
    ContentGeneratorService,
    ContentIntelligenceService,
    CreatorScraperService,
    PatternAnalyzerService,
    PatternStoreService,
    PlaybookBuilderService,
  ],
  imports: [
    forwardRef(() => AgentContextAssemblyModule),
    forwardRef(() => BrandsModule),
    ApifyModule,
    ContentHarnessModule,
    HarnessProfilesModule,
    HttpModule,
    OpenRouterModule,
    forwardRef(() => PersonasModule),
  ],
  providers: [
    ContentGeneratorService,
    ContentIntelligenceService,
    CreatorScraperService,
    PatternAnalyzerService,
    PatternStoreService,
    PlaybookBuilderService,
  ],
})
export class ContentIntelligenceModule {}
