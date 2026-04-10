import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    TaskDecompositionService,
    TaskOrchestratorService,
    WorkspaceTaskQualityService,
  ],
  imports: [
    LoggerModule,
    LlmDispatcherModule,
    forwardRef(() => AgentRunsModule),
    forwardRef(() => TasksModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => VideoGenerationModule),
  ],
  providers: [
    TaskDecompositionService,
    TaskOrchestratorService,
    WorkspaceTaskQualityService,
  ],
})
export class TaskOrchestrationModule {}
