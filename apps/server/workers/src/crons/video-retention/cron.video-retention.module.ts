import { VideoRetentionModule } from '@api/services/video-retention/video-retention.module';
import { Module } from '@nestjs/common';
import { CronVideoRetentionService } from '@workers/crons/video-retention/cron.video-retention.service';

@Module({
  exports: [CronVideoRetentionService],
  imports: [VideoRetentionModule],
  providers: [CronVideoRetentionService],
})
export class CronVideoRetentionModule {}
