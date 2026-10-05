import { TasksModule } from '@api/collections/tasks/tasks.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { WorkspaceTaskExecutionListener } from '@api/services/task-orchestration/listeners/workspace-task-execution.listener';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Rolls a workspace task up when its linked executions settle. Events are
 * process-local and executions settle in both the API (cancel) and the
 * workers, so every process imports this module; it is the only place the
 * listener is provided, so each process subscribes exactly once.
 */
@Module({
  exports: [TaskOrchestratorService, WorkspaceTaskQualityService],
  imports: [
    LlmDispatcherModule,
    LoggerModule,
    TasksModule,
    WorkflowExecutionsModule,
  ],
  providers: [
    TaskOrchestratorService,
    WorkspaceTaskExecutionListener,
    WorkspaceTaskQualityService,
  ],
})
export class WorkspaceTaskRollupModule {}
