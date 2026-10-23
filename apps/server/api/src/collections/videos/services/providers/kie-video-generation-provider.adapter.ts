import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { KieService } from '@api/services/integrations/kie/kie.service';
import { Injectable } from '@nestjs/common';
@Injectable()
export class KieVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'kie' as const;
  constructor(private readonly kie: KieService) {}
  supports(_model: string, provider?: string): boolean {
    return provider === 'kie';
  }
  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    if (params.apiKeyOverride)
      throw new Error(
        'Provider-bound credentials cannot be forwarded to Kie.ai',
      );
    const url = await this.kie.generateVideo(
      params.modelEndpoint ?? params.model,
      params.promptParams,
      params.onProviderSubmissionStarted,
      params.abortSignal,
    );
    return {
      provider: this.provider,
      externalId: url,
      completion: 'remote-output',
    };
  }
}
