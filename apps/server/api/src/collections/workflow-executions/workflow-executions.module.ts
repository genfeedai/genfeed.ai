/**
 * Workflow Executions Module
 * Tracks execution history for workflows including node-by-node results,
 * duration, status, and error information.
 */
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { UsersModule } from '@api/collections/users/users.module';
import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    WorkflowExecutionsController,
    InternalWorkflowExecutionsController,
  ],
  exports: [WorkflowExecutionsService],
  imports: [
    AgentThreadsModule,
    WorkflowsCoreModule,
    UsersModule,
    NotificationsModule,
    WebhookClientModule,
  ],
  providers: [
    AdminApiKeyGuard,
    WorkflowExecutionAuthorizationService,
    WorkflowExecutionsService,
  ],
})
export class WorkflowExecutionsModule {}
