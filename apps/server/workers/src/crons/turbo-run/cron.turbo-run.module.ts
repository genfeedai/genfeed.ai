import { TurboProjectsModule } from '@api/collections/turbo-projects/turbo-projects.module';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronTurboRunReconcileService } from '@workers/crons/turbo-run/cron.turbo-run-reconcile.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  exports: [CronTurboRunReconcileService],
  imports: [
    TurboProjectsModule,
    forwardRef(() => TurboRunModule),
    forwardRef(() => WorkersQueuesModule),
    LoggerModule,
  ],
  providers: [CronTurboRunReconcileService],
})
export class CronTurboRunModule {}
