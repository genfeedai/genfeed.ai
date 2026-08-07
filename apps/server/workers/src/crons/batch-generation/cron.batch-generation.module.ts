import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  exports: [CronBatchGenerationReconcileService],
  imports: [
    forwardRef(() => BatchGenerationModule),
    forwardRef(() => WorkersQueuesModule),
    LoggerModule,
  ],
  providers: [CronBatchGenerationReconcileService],
})
export class CronBatchGenerationModule {}
