import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { PortraitConversionService } from '@api/services/clip-orchestrator/portrait-conversion.service';
import { WorkflowTriggerBridgeService } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  exports: [
    ClipOrchestratorService,
    PortraitConversionService,
    WorkflowTriggerBridgeService,
  ],
  imports: [
    EventEmitterModule.forRoot(),
    FilesClientModule,
    FileQueueModule,
    ReplicateModule,
  ],
  providers: [
    ClipOrchestratorService,
    PortraitConversionService,
    WorkflowTriggerBridgeService,
  ],
})
export class ClipOrchestratorModule {}
