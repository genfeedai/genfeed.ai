import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';

@Module({
  exports: [CronMediaPerceptionService],
  imports: [LoggerModule, MediaPerceptionModule],
  providers: [CronMediaPerceptionService],
})
export class CronMediaPerceptionModule {}
