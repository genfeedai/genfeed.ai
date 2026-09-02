import { TasksModule } from '@api/collections/tasks/tasks.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { WorkspaceTaskWorkflowService } from '@api/services/task-orchestration/workspace-task-workflow.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

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
    TasksModule,
    QueuesModule,
    VideoGenerationModule,
    WorkflowsModule,
    WorkflowExecutionsModule,
  ],
  providers: [
    TaskDecompositionService,
    TaskOrchestratorService,
    WorkspaceTaskQualityService,
    WorkspaceTaskWorkflowService,
  ],
})
export class TaskOrchestrationModule {}
