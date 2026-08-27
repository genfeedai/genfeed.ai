import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  exports: [CronBatchGenerationReconcileService],
  imports: [
    WorkersDomainModule,
    forwardRef(() => WorkersQueuesModule),
    LoggerModule,
  ],
  providers: [CronBatchGenerationReconcileService],
})
export class CronBatchGenerationModule {}
