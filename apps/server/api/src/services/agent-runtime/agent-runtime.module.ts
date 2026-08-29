import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { AgentRuntimeService } from '@server/services/agent-runtime/agent-runtime.service';

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
