import { TrendsModule } from '@api/collections/trends/trends.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';

@Module({
  imports: [CacheModule, NotificationsModule, TrendsModule],
  providers: [CronTrendsService],
})
export class CronTrendsModule {}
