import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { AgentThreadRuntimeController } from '@api/services/agent-threading/controllers/agent-thread-runtime.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentThreadRuntimeController],
  exports: [AgentThreadingCoreModule],
  imports: [AgentThreadingCoreModule, AgentOrchestratorModule],
})
export class AgentThreadingModule {}
