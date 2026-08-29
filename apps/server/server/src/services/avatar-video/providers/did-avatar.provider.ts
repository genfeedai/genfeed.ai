import type { AvatarVideoProviderName } from '@genfeedai/interfaces';
import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@server/services/avatar-video/avatar-video-provider.interface';

@Injectable()
export class DidAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'did';

  async generateVideo(
    _input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('D-ID provider coming soon');
  }

  async getStatus(
    _jobId: string,
    _organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('D-ID provider coming soon');
  }
}
