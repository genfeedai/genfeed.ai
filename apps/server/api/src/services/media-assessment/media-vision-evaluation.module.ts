import { ContentQualityModule } from '@api/services/content-quality/content-quality.module';
import { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Write side of the vision gate (#4881); imported by the workers runtime. */
@Module({
  exports: [MediaVisionEvaluationService],
  imports: [
    ConfigModule,
    ContentQualityModule,
    LoggerModule,
    MediaPerceptionModule,
  ],
  providers: [MediaVisionEvaluationService],
})
export class MediaVisionEvaluationModule {}
