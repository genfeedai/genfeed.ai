import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { Module } from '@nestjs/common';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';

@Module({
  exports: [CronWorkflowArtifactsService],
  imports: [WorkflowsModule],
  providers: [CronWorkflowArtifactsService],
})
export class CronWorkflowArtifactsModule {}
