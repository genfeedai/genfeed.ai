import { BatchProjectsModule } from '@api/collections/batch-projects/batch-projects.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CronBatchProjectsReconcileService } from '@workers/crons/batch-projects/cron.batch-projects-reconcile.service';

@Module({
  exports: [CronBatchProjectsReconcileService],
  imports: [BatchProjectsModule, LoggerModule],
  providers: [CronBatchProjectsReconcileService],
})
export class CronBatchProjectsModule {}
