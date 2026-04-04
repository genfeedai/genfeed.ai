import { forwardRef, Module } from '@nestjs/common';
import { CronAdInsightsService } from '@workers/crons/ad-insights/cron.ad-insights.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [forwardRef(() => WorkersQueuesModule)],
  providers: [CronAdInsightsService],
})
export class CronAdInsightsModule {}
