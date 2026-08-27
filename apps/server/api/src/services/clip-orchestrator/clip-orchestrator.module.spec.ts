vi.mock('@genfeedai/workflows', () => ({
  buildWorkflowGenerationMessages: vi.fn(() => []),
  parseWorkflowGenerationResponse: vi.fn(() => ({ workflow: {} })),
}));

import { ClipContinuityFinalizationService } from '@api/services/clip-orchestrator/clip-continuity-finalization.service';
import { ClipOrchestratorModule } from '@api/services/clip-orchestrator/clip-orchestrator.module';
import { ClipOrchestratorService } from '@server/services/clip-orchestrator/clip-orchestrator.service';
import { ClipOrchestratorStateStore } from '@server/services/clip-orchestrator/clip-orchestrator-state.store';
import { ClipRunObserverService } from '@api/services/clip-orchestrator/clip-run-observer.service';
import { PortraitConversionService } from '@api/services/clip-orchestrator/portrait-conversion.service';
import { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import { VideoMergeService } from '@api/services/clip-orchestrator/video-merge.service';
import { WorkflowTriggerBridgeService } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('ClipOrchestratorModule', () => {
  it('registers and exports all clip orchestration services', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ClipOrchestratorModule) ??
      [];
    const exports =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, ClipOrchestratorModule) ??
      [];

    for (const service of [
      ClipOrchestratorService,
      ClipContinuityFinalizationService,
      ClipOrchestratorStateStore,
      ClipRunObserverService,
      PortraitConversionService,
      PublishHandoffService,
      VideoMergeService,
      WorkflowTriggerBridgeService,
    ]) {
      expect(providers).toContain(service);
      expect(exports).toContain(service);
    }
  });
});
