import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentExecutionRecoveryEventService } from '@api/services/agent-threading/services/agent-execution-recovery-event.service';
import { AgentInputAlertService } from '@api/services/agent-threading/services/agent-input-alert.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { AgentThreadStatusPublisherService } from '@api/services/agent-threading/services/agent-thread-status-publisher.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Thread runtime services without the orchestrator HTTP module.
 * Orchestrator imports this; the fat threading module adds the controller.
 */
@Module({
  exports: [
    AgentThreadsModule,
    AgentMessagesModule,
    AgentMemoriesModule,
    UsersCoreModule,
    AgentExecutionLaneService,
    AgentExecutionRecoveryEventService,
    AgentProfileResolverService,
    AgentRuntimeSessionService,
    AgentThreadEngineService,
    AgentThreadProjectorService,
    AgentThreadStatusPublisherService,
    ThreadContextCompressorService,
  ],
  imports: [
    ActivityRecordingModule,
    PlatformSettingsModule,
    AgentThreadsModule,
    AgentMemoriesModule,
    AgentMessagesModule,
    UsersCoreModule,
    LlmDispatcherModule,
    LoggerModule,
  ],
  providers: [
    AgentExecutionLaneService,
    AgentInputAlertService,
    AgentExecutionRecoveryEventService,
    AgentProfileResolverService,
    AgentRuntimeSessionService,
    AgentThreadEngineService,
    AgentThreadProjectorService,
    AgentThreadStatusPublisherService,
    ThreadContextCompressorService,
  ],
})
export class AgentThreadingCoreModule {}
