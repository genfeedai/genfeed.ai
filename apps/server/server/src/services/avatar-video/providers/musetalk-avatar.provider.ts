import type { AvatarVideoProviderName } from '@genfeedai/interfaces';
import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@server/services/avatar-video/avatar-video-provider.interface';

/**
 * MuseTalk — self-hosted avatar generation via Fleet/ComfyUI.
 *
 * When Fleet ComfyUI endpoint is available this will route to it.
 * For now: stub.
 */
@Injectable()
export class MusetalkAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'musetalk';

  async generateVideo(
    _input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('MuseTalk provider coming soon');
  }

  async getStatus(
    _jobId: string,
    _organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('MuseTalk provider coming soon');
  }
}
