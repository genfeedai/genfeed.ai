import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { UsersModule } from '@api/collections/users/users.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentThreadsController } from '@api/services/agent-threading/controllers/agent-threads.controller';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentThreadsController],
  exports: [
    AgentExecutionLaneService,
    AgentProfileResolverService,
    AgentRuntimeSessionService,
    AgentThreadEngineService,
    AgentThreadProjectorService,
    ThreadContextCompressorService,
  ],
  imports: [
    AgentThreadsModule,
    AgentMemoriesModule,
    AgentMessagesModule,
    UsersModule,
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => LlmDispatcherModule),
    LoggerModule,
  ],
  providers: [
    AgentExecutionLaneService,
    AgentProfileResolverService,
    AgentRuntimeSessionService,
    AgentThreadEngineService,
    AgentThreadProjectorService,
    ThreadContextCompressorService,
  ],
})
export class AgentThreadingModule {}
