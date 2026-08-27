import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { SystemWorkflowProvenanceService } from '@server/collections/workflows/system-workflow-provenance.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  exports: [CronReviewGateTimeoutService],
  imports: [
    PrismaModule,
    WorkersDomainModule,
  ],
  providers: [CronReviewGateTimeoutService, SystemWorkflowProvenanceService],
})
export class CronReviewGateModule {}
