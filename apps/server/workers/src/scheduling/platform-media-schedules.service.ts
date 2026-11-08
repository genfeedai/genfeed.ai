import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { Injectable } from '@nestjs/common';
import { CronAvatarTwinsService } from '@workers/crons/avatar-twins/cron.avatar-twins.service';
import { CrunReconcileService } from '@workers/services/crun-reconcile.service';

@Injectable()
export class PlatformMediaSchedulesService {
  constructor(
    private readonly videoCompletion: VideoCompletionService,
    private readonly crun: CrunReconcileService,
    private readonly avatarTwins: CronAvatarTwinsService,
  ) {}

  async trackAvatarTwins(): Promise<void> {
    await this.avatarTwins.trackWaitingTwins();
  }

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
