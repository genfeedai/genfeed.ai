import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { ClipContinuityFinalizationService } from '@api/services/clip-orchestrator/clip-continuity-finalization.service';
import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipOrchestratorStateStore } from '@api/services/clip-orchestrator/clip-orchestrator-state.store';
import { ClipRunObserverService } from '@api/services/clip-orchestrator/clip-run-observer.service';
import { PortraitConversionService } from '@api/services/clip-orchestrator/portrait-conversion.service';
import { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import { VideoMergeService } from '@api/services/clip-orchestrator/video-merge.service';
import { WorkflowTriggerBridgeService } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  exports: [
    ClipOrchestratorService,
    ClipContinuityFinalizationService,
    ClipRunObserverService,
    ClipOrchestratorStateStore,
    PortraitConversionService,
    PublishHandoffService,
    VideoMergeService,
    WorkflowTriggerBridgeService,
  ],
  imports: [
    BrandsCoreModule,
    ClipResultsModule,
    EventEmitterModule.forRoot(),
    FilesClientModule,
    FileQueueModule,
    LlmDispatcherModule,
    ReplicateModule,
    RedisModule,
  ],
  providers: [
    ClipOrchestratorService,
    ClipContinuityFinalizationService,
    ClipOrchestratorStateStore,
    ClipRunObserverService,
    PortraitConversionService,
    PublishHandoffService,
    VideoMergeService,
    WorkflowTriggerBridgeService,
  ],
})
export class ClipOrchestratorModule {}
