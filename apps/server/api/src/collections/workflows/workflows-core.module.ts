import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { Module } from '@nestjs/common';

/** Workflow persistence only. Run/marketplace HTTP stays on WorkflowsModule. */
@Module({
  exports: [WorkflowsService],
  providers: [WorkflowsService],
})
export class WorkflowsCoreModule {}
