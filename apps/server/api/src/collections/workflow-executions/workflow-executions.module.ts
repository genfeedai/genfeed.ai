/**
 * Workflow Executions Module
 * Tracks execution history for workflows including node-by-node results,
 * duration, status, and error information.
 */
import { UsersModule } from '@api/collections/users/users.module';
import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    WorkflowExecutionsController,
    InternalWorkflowExecutionsController,
  ],
  exports: [WorkflowExecutionsService],
  imports: [
    WorkflowsCoreModule,
    forwardRef(() => UsersModule),
    forwardRef(() => WebhookClientModule),
  ],
  providers: [AdminApiKeyGuard, WorkflowExecutionsService],
})
export class WorkflowExecutionsModule {}
