import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { ExpertPathController } from '@api/services/expert-path/expert-path.controller';
import { ExpertPositioningModule } from '@api/services/expert-path/expert-positioning.module';
import { ExpertCorpusService } from '@api/services/expert-path/services/expert-corpus.service';
import { ExpertFirstSystemService } from '@api/services/expert-path/services/expert-first-system.service';
import { ExpertPathService } from '@api/services/expert-path/services/expert-path.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Expert Path HTTP surface (#4534): status, positioning regeneration, and the
 * first content system. Positioning persistence lives in
 * `ExpertPositioningModule` so the brand interview can import it one-way.
 */
@Module({
  controllers: [ExpertPathController],
  exports: [ExpertPathService],
  imports: [
    BrandMemoryModule,
    ContentEngineModule,
    ContentHarnessModule,
    ContentPlanItemsModule,
    ContentPlansModule,
    CreditsModule,
    ExpertPositioningModule,
    HarnessProfilesModule,
    LoggerModule,
  ],
  providers: [ExpertCorpusService, ExpertFirstSystemService, ExpertPathService],
})
export class ExpertPathModule {}
