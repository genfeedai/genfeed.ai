import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
  AvatarVideoProviderName,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { Injectable, NotImplementedException } from '@nestjs/common';

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
