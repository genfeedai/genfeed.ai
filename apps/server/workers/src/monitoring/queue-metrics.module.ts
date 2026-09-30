import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';
import { QueueHealthMonitorService } from '@workers/monitoring/queue-health-monitor.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';
import { WorkerDiagnosticsService } from '@workers/monitoring/worker-diagnostics.service';

@Module({
  exports: [QueueMetricsService],
  imports: [DiscoveryModule, LoggerModule],
  providers: [
    QueueHealthAlertNotifierService,
    QueueHealthMonitorService,
    QueueMetricsService,
    WorkerDiagnosticsService,
  ],
})
export class QueueMetricsModule {}
