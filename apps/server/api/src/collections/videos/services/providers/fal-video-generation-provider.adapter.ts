import { isFalDestination } from '@api/collections/models/utils/model-key.util';
import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { Injectable } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';

@Injectable()
export class FalVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string): boolean {
    return isFalDestination(model);
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const result = await this.falService.generateVideo(params.model, {
      prompt: params.prompt,
      ...(params.duration && { duration: params.duration }),
      ...(params.imageUrl && { image_url: params.imageUrl }),
    });
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }
}
