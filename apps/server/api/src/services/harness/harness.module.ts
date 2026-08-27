import { ContentHarnessService } from '@server/services/harness/harness.service';
import { HarnessGenerationService } from '@server/services/harness/harness-generation.service';
import { HarnessReviewFeedbackService } from '@server/services/harness/harness-review-feedback.service';
import { HarnessWinnerPromotionService } from '@server/services/harness/harness-winner-promotion.service';
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
    HarnessReviewFeedbackService,
    HarnessWinnerPromotionService,
  ],
  imports: [ConfigModule, LoggerModule],
  providers: [
    ContentHarnessService,
    HarnessGenerationService,
    HarnessReviewFeedbackService,
    HarnessWinnerPromotionService,
  ],
})
export class ContentHarnessModule {}
