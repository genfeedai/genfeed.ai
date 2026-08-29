import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';

@Module({
  exports: [CronReviewGateTimeoutService],
  imports: [PrismaModule, WorkflowExecutionsModule, WorkflowsModule],
  providers: [CronReviewGateTimeoutService],
})
export class CronReviewGateModule {}
