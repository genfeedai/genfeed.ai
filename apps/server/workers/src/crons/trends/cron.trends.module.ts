import { Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [CacheModule, WorkersDomainModule],
  providers: [CronTrendsService],
})
export class CronTrendsModule {}
