import { Module } from '@nestjs/common';
import { WorkersDomainModule } from '@server/workers-domain.module';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';

@Module({
  exports: [CronRssAutopostService],
  imports: [WorkersDomainModule],
  providers: [CronRssAutopostService],
})
export class CronRssModule {}
