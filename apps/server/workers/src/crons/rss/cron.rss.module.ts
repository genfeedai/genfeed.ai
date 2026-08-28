import { RssSourcesModule } from '@api/collections/rss-sources/rss-sources.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { Module } from '@nestjs/common';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';

@Module({
  exports: [CronRssAutopostService],
  imports: [RssSourcesModule, WorkflowsModule],
  providers: [CronRssAutopostService],
})
export class CronRssModule {}
