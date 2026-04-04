import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAdOptimizationService } from '@workers/crons/ad-optimization/cron.ad-optimization.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [forwardRef(() => WorkersQueuesModule), AdOptimizationConfigsModule],
  providers: [CronAdOptimizationService],
})
export class CronAdOptimizationModule {}
