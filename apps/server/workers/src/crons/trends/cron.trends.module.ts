import { TrendsModule } from '@api/collections/trends/trends.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { Module } from '@nestjs/common';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import { TrendIngestionHealthService } from '@workers/services/trend-ingestion-health.service';

@Module({
  exports: [CronTrendsService],
  imports: [
    ActivityRecordingModule,
    CacheModule,
    TrendsModule,
    WorkflowsModule,
  ],
  providers: [CronTrendsService, TrendIngestionHealthService],
})
export class CronTrendsModule {}
