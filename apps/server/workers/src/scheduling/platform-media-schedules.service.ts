import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { Injectable } from '@nestjs/common';
import { CrunReconcileService } from '@workers/services/crun-reconcile.service';

@Injectable()
export class PlatformMediaSchedulesService {
  constructor(
    private readonly videoCompletion: VideoCompletionService,
    private readonly crun: CrunReconcileService,
  ) {}

  async reconcileCrunTasks(): Promise<void> {
    await this.crun.reconcile();
  }

  async synchronizeCrunContracts(): Promise<void> {
    await this.crun.synchronizeContracts();
  }

  async reconcileEditorRenders(): Promise<void> {
    await this.videoCompletion.reconcileEditorRenders();
  }

  async reconcileRawCutClips(): Promise<void> {
    await this.videoCompletion.reconcileRawCutClips();
  }
}
