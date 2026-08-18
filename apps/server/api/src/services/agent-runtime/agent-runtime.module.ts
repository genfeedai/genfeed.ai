import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

/**
 * Facade over run create + queue + thread provenance for automation callers
 * (campaigns). Chat continues through AgentOrchestratorModule.
 */
@Module({
  exports: [AgentRuntimeService],
  imports: [
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentThreadsModule),
    QueuesModule,
    forwardRef(() => AgentThreadingModule),
    LoggerModule,
  ],
  providers: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
