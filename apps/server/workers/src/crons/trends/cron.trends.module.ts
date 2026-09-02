import { TrendsModule } from '@api/collections/trends/trends.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { Module } from '@nestjs/common';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';

@Module({
  exports: [CronTrendsService],
  imports: [CacheModule, TrendsModule, WorkflowsModule],
  providers: [CronTrendsService],
})
export class CronTrendsModule {}
