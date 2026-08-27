import { AgentRunsCoreModule } from '@api/collections/agent-runs/agent-runs-core.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentRuntimeService } from '@server/services/agent-runtime/agent-runtime.service';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Facade over run create + queue + thread provenance for automation callers
 * (campaigns). Chat continues through AgentOrchestratorModule.
 */
@Module({
  exports: [AgentRuntimeService],
  imports: [
    AgentRunsCoreModule,
    AgentThreadsModule,
    QueuesModule,
    AgentThreadingCoreModule,
    LoggerModule,
  ],
  providers: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
