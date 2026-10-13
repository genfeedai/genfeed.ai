import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { Module } from '@nestjs/common';
import { CronBrandedDispatchRecoveryService } from '@workers/crons/branded-dispatch-recovery/cron.branded-dispatch-recovery.service';

@Module({
  exports: [CronBrandedDispatchRecoveryService],
  imports: [BrandedGenerationReceiptsModule],
  providers: [CronBrandedDispatchRecoveryService],
})
export class CronBrandedDispatchRecoveryModule {}
