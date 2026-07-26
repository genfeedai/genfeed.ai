import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { Injectable } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

@Injectable()
export class ReplicateVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(private readonly replicateService: ReplicateService) {}

  supports(_model: string): boolean {
    return true;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const externalId = await this.replicateService.generateTextToVideo(
      params.model,
      params.promptParams,
    );
    return {
      completion: 'polling',
      externalId,
      provider: this.provider,
    };
  }
}
