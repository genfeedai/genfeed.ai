import { MediaAssessmentService } from '@api/services/media-assessment/media-assessment.service';
import { MediaReadinessModule } from '@api/services/media-readiness/media-readiness.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

/**
 * Read side of the media gates (#4881): folds readiness, moderation and vision
 * results into one tighten-only assessment. Reads persisted rows only, so it
 * stays cheap to import from publish paths without pulling in classifiers.
 */
@Module({
  exports: [MediaAssessmentService],
  imports: [ConfigModule, MediaReadinessModule],
  providers: [MediaAssessmentService],
})
export class MediaAssessmentModule {}
