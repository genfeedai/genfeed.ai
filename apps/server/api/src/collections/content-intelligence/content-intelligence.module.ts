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
import {
  ContentPattern,
  ContentPatternSchema,
} from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import {
  CreatorAnalysis,
  CreatorAnalysisSchema,
} from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import {
  PatternPlaybook,
  PatternPlaybookSchema,
} from '@api/collections/content-intelligence/schemas/pattern-playbook.schema';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { CreatorScraperService } from '@api/collections/content-intelligence/services/creator-scraper.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

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
    MongooseModule,
    PatternAnalyzerService,
    PatternStoreService,
    PlaybookBuilderService,
  ],
  imports: [
    forwardRef(() => AgentContextAssemblyModule),
    forwardRef(() => BrandsModule),
    ApifyModule,
    ContentHarnessModule,
    HttpModule,
    OpenRouterModule,
    forwardRef(() => PersonasModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: CreatorAnalysis.name,
          useFactory: () => {
            const schema = CreatorAnalysisSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Handle lookup by platform
            schema.index({ handle: 1, organization: 1, platform: 1 });

            // Status filtering
            schema.index({ organization: 1, status: 1 });

            // Niche and tags
            schema.index({ niche: 1, organization: 1 });
            schema.index({ organization: 1, tags: 1 });

            return schema;
          },
        },
        {
          name: ContentPattern.name,
          useFactory: () => {
            const schema = ContentPatternSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Pattern type filtering
            schema.index({ organization: 1, patternType: 1 });

            // Template category filtering
            schema.index({ organization: 1, templateCategory: 1 });

            // Platform filtering
            schema.index({ organization: 1, platform: 1 });

            // Source creator lookup
            schema.index({ isDeleted: 1, sourceCreator: 1 });

            // Engagement rate sorting
            schema.index({
              organization: 1,
              'sourceMetrics.engagementRate': -1,
            });

            // Tags filtering
            schema.index({ organization: 1, tags: 1 });

            return schema;
          },
        },
        {
          name: PatternPlaybook.name,
          useFactory: () => {
            const schema = PatternPlaybookSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Platform filtering
            schema.index({ organization: 1, platform: 1 });

            // Niche filtering
            schema.index({ niche: 1, organization: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
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
