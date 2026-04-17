/**
 * Workflow Executions Module
 * Tracks execution history for workflows including node-by-node results,
 * duration, status, and error information.
 */
import { UsersModule } from '@api/collections/users/users.module';
import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    WorkflowExecutionsController,
    InternalWorkflowExecutionsController,
  ],
  exports: [WorkflowExecutionsService],
  imports: [forwardRef(() => WorkflowsModule), forwardRef(() => UsersModule)],
  providers: [AdminApiKeyGuard, WorkflowExecutionsService],
})
export class WorkflowExecutionsModule {}
