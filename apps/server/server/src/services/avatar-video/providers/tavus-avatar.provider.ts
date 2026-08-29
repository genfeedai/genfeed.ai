import type { AvatarVideoProviderName } from '@genfeedai/interfaces';
import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@server/services/avatar-video/avatar-video-provider.interface';

@Injectable()
export class TavusAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'tavus';

  async generateVideo(
    _input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('Tavus provider coming soon');
  }

  async getStatus(
    _jobId: string,
    _organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    throw new NotImplementedException('Tavus provider coming soon');
  }
}
