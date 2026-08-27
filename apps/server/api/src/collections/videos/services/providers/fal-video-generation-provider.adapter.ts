import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@server/collections/models/utils/model-key.util';
import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import type { ModelProvider } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import {
  adaptFalVideoRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@server/services/integrations/fal/services/fal-contract';

@Injectable()
export class FalVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string, provider?: ModelProvider | string): boolean {
    return isFalDestination(model, provider);
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const legacyInput = {
      prompt: params.prompt,
      ...(params.duration && { duration: params.duration }),
      ...(params.imageUrl && { image_url: params.imageUrl }),
    };
    const input =
      params.modelSchemaFamily && params.modelInputSchema
        ? adaptFalVideoRequest(
            params.modelSchemaFamily as FalSchemaFamily,
            params.modelInputSchema as FalJsonSchema,
            {
              duration: params.duration,
              imageUrl: params.imageUrl,
              prompt: params.prompt,
              promptParams: params.promptParams,
            },
          )
        : legacyInput;
    const result = await this.falService.generateVideo(
      params.modelEndpoint ?? getFalEndpointFromModelKey(params.model),
      input,
    );
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }
}
