import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipOrchestratorStateStore } from '@api/services/clip-orchestrator/clip-orchestrator-state.store';
import { ClipRunObserverService } from '@api/services/clip-orchestrator/clip-run-observer.service';
import { PortraitConversionService } from '@api/services/clip-orchestrator/portrait-conversion.service';
import { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import { VideoMergeService } from '@api/services/clip-orchestrator/video-merge.service';
import { WorkflowTriggerBridgeService } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RedisModule } from '@libs/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  exports: [
    ClipOrchestratorService,
    ClipRunObserverService,
    ClipOrchestratorStateStore,
    PortraitConversionService,
    PublishHandoffService,
    VideoMergeService,
    WorkflowTriggerBridgeService,
  ],
  imports: [
    EventEmitterModule.forRoot(),
    forwardRef(() => FilesClientModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RedisModule),
  ],
  providers: [
    ClipOrchestratorService,
    ClipOrchestratorStateStore,
    ClipRunObserverService,
    PortraitConversionService,
    PublishHandoffService,
    VideoMergeService,
    WorkflowTriggerBridgeService,
  ],
})
export class ClipOrchestratorModule {}
