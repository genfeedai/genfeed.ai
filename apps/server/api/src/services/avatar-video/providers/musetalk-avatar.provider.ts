import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
  AvatarVideoProviderName,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * MuseTalk — self-hosted avatar generation via Darkroom/ComfyUI.
 *
 * When Darkroom ComfyUI endpoint is available this will route to it.
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
