import { MediaAssessmentService } from '@api/services/media-assessment/media-assessment.service';
import { MediaReadinessModule } from '@api/services/media-readiness/media-readiness.module';
import { TypedDecisionsModule } from '@api/services/typed-decisions/typed-decisions.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

/**
 * Read side of the media gates (#4881): folds readiness, moderation, vision
 * and text-decision results into one tighten-only assessment. Reads persisted
 * rows only, so it stays cheap to import from publish paths without pulling in
 * classifiers; typed decisions are imported only to ask whether a provider is
 * bound (a cached settings read, never a decision).
 */
@Module({
  exports: [MediaAssessmentService],
  imports: [ConfigModule, MediaReadinessModule, TypedDecisionsModule],
  providers: [MediaAssessmentService],
})
export class MediaAssessmentModule {}
