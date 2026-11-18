import { Module } from '@nestjs/common';
import { CronNotificationRetentionService } from '@workers/crons/notification-retention/cron.notification-retention.service';

@Module({
  exports: [CronNotificationRetentionService],
  providers: [CronNotificationRetentionService],
})
export class CronNotificationRetentionModule {}
