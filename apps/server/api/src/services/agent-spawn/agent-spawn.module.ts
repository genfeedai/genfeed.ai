import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentSpawnService],
  imports: [LoggerModule, AgentContextAssemblyModule],
  providers: [AgentSpawnService],
})
export class AgentSpawnModule {}
