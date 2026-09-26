import { MediaVisionEvaluationModule } from '@api/services/media-assessment/media-vision-evaluation.module';
import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { MediaTextDecisionsModule } from '@api/services/media-text-decisions/media-text-decisions.module';
import { ModerationModule } from '@api/services/moderation/moderation.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';

@Module({
  exports: [CronMediaPerceptionService],
  imports: [
    LoggerModule,
    MediaPerceptionModule,
    MediaTextDecisionsModule,
    MediaVisionEvaluationModule,
    ModerationModule,
  ],
  providers: [CronMediaPerceptionService],
})
export class CronMediaPerceptionModule {}
