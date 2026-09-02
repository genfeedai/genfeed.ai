import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class KlingAiVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'klingai' as const;

  constructor(private readonly klingAiService: KlingAIService) {}

  supports(model: string): boolean {
    return model === MODEL_KEYS.KLINGAI_V2;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const externalId = await this.klingAiService.queueGenerateTextToVideo(
      params.prompt,
      {
        height: params.height,
        model: params.model,
        width: params.width,
      },
    );
    return {
      completion: 'polling',
      externalId,
      provider: this.provider,
    };
  }
}
