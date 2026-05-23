import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentSpawnService } from '@api/services/agent-spawn/agent-spawn.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [AgentSpawnService],
  imports: [LoggerModule, forwardRef(() => AgentContextAssemblyModule)],
  providers: [AgentSpawnService],
})
export class AgentSpawnModule {}
