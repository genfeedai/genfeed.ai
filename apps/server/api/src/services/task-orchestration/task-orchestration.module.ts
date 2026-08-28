import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { TaskDecompositionService } from '@server/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@server/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@server/services/task-orchestration/workspace-task-quality.service';
import { WorkspaceTaskWorkflowService } from '@server/services/task-orchestration/workspace-task-workflow.service';

@Module({
  exports: [
    TaskDecompositionService,
    TaskOrchestratorService,
    WorkspaceTaskQualityService,
    VideoGenerationModule,
  ],
  imports: [
    ConfigModule,
    LoggerModule,
    LlmDispatcherModule,
    AgentRunsModule,
    TasksModule,
    QueuesModule,
    VideoGenerationModule,
    WorkflowsModule,
  ],
  providers: [
    TaskDecompositionService,
    TaskOrchestratorService,
    WorkspaceTaskQualityService,
    WorkspaceTaskWorkflowService,
  ],
})
export class TaskOrchestrationModule {}
