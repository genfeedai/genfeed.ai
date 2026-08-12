import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * Brand taste + content memory for generation.
 * Content memory is Postgres pgvector via ContextsModule (no separate vector product).
 */
@Module({
  exports: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessWinnerPromotionService,
  ],
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => HarnessProfilesModule),
    forwardRef(() => ContentPerformanceModule),
    // Brand content memory: retrieve + embed winners into context_entries.embedding
    forwardRef(() => ContextsModule),
  ],
  providers: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessWinnerPromotionService,
  ],
})
export class ContentHarnessModule {}
