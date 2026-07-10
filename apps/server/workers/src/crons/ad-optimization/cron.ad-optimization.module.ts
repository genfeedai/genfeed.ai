import { forwardRef, Module } from '@nestjs/common';
import { CronAdOptimizationService } from '@workers/crons/ad-optimization/cron.ad-optimization.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { AdsServicesModule } from '@workers/services/ads-services.module';

@Module({
  imports: [forwardRef(() => WorkersQueuesModule), AdsServicesModule],
  providers: [CronAdOptimizationService],
})
export class CronAdOptimizationModule {}
