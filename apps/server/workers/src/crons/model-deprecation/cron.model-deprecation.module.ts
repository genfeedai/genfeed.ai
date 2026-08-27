import { forwardRef, Module } from '@nestjs/common';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [
    WorkersDomainModule,
  ],
  providers: [CronModelDeprecationService],
})
export class CronModelDeprecationModule {}
