import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';

@Module({
  imports: [LoggerModule],
  providers: [QueueMetricsService],
})
export class QueueMetricsModule {}
