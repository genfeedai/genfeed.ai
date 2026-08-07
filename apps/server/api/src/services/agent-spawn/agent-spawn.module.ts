import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [AgentSpawnService],
  imports: [
    AgentChatModelRegistryModule,
    LoggerModule,
    forwardRef(() => AgentContextAssemblyModule),
  ],
  providers: [AgentSpawnService],
})
export class AgentSpawnModule {}
