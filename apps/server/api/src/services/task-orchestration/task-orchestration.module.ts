import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { WorkspaceTasksModule } from '@api/collections/workspace-tasks/workspace-tasks.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [TaskDecompositionService, TaskOrchestratorService],
  imports: [
    LoggerModule,
    LlmDispatcherModule,
    forwardRef(() => AgentRunsModule),
    forwardRef(() => WorkspaceTasksModule),
    forwardRef(() => QueuesModule),
  ],
  providers: [TaskDecompositionService, TaskOrchestratorService],
})
export class TaskOrchestrationModule {}
