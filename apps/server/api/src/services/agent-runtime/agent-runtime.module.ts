import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Facade over the hidden agent-turn workflow for automation callers.
 */
@Module({
  exports: [AgentRuntimeService],
  imports: [
    AgentThreadsModule,
    AgentThreadingCoreModule,
    LoggerModule,
    WorkflowsModule,
  ],
  providers: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
