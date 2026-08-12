import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

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
  imports: [ConfigModule, LoggerModule],
  providers: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessWinnerPromotionService,
  ],
})
export class ContentHarnessModule {}
