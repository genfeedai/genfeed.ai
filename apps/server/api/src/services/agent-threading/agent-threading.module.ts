import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentThreadsController } from '@api/services/agent-threading/controllers/agent-threads.controller';
import {
  AgentInputRequest,
  AgentInputRequestSchema,
} from '@api/services/agent-threading/schemas/agent-input-request.schema';
import {
  AgentProfileSnapshot,
  AgentProfileSnapshotSchema,
} from '@api/services/agent-threading/schemas/agent-profile-snapshot.schema';
import {
  AgentSessionBinding,
  AgentSessionBindingSchema,
} from '@api/services/agent-threading/schemas/agent-session-binding.schema';
import {
  AgentThreadEvent,
  AgentThreadEventSchema,
} from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import {
  AgentThreadSnapshot,
  AgentThreadSnapshotSchema,
} from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

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
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentThreadEvent.name,
          useFactory: () => AgentThreadEventSchema,
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentThreadSnapshot.name,
          useFactory: () => AgentThreadSnapshotSchema,
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentSessionBinding.name,
          useFactory: () => AgentSessionBindingSchema,
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentInputRequest.name,
          useFactory: () => AgentInputRequestSchema,
        },
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: AgentProfileSnapshot.name,
          useFactory: () => AgentProfileSnapshotSchema,
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
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
