import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { Module } from '@nestjs/common';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';

@Module({
  exports: [CronReviewGateTimeoutService],
  imports: [WorkflowExecutionsModule, WorkflowsModule],
  providers: [CronReviewGateTimeoutService, SystemWorkflowProvenanceService],
})
export class CronReviewGateModule {}
