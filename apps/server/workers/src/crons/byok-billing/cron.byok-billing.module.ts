import { forwardRef, Module } from '@nestjs/common';
import { CronByokBillingService } from '@workers/crons/byok-billing/cron.byok-billing.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [
    WorkersDomainModule,
  ],
  providers: [CronByokBillingService],
})
export class CronByokBillingModule {}
