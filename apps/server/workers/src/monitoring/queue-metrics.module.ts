import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';
import { QueueHealthMonitorService } from '@workers/monitoring/queue-health-monitor.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';

@Module({
  exports: [QueueMetricsService],
  imports: [LoggerModule],
  providers: [
    QueueHealthAlertNotifierService,
    QueueHealthMonitorService,
    QueueMetricsService,
  ],
})
export class QueueMetricsModule {}
