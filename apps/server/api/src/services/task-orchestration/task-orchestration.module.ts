import { TasksModule } from '@api/collections/tasks/tasks.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { WorkspaceTaskRollupModule } from '@api/services/task-orchestration/workspace-task-rollup.module';
import { WorkspaceTaskWorkflowService } from '@api/services/task-orchestration/workspace-task-workflow.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    TaskDecompositionService,
    WorkspaceTaskRollupModule,
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
    WorkspaceTaskRollupModule,
  ],
  providers: [TaskDecompositionService, WorkspaceTaskWorkflowService],
})
export class TaskOrchestrationModule {}
