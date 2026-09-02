import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/services/leonardoai.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LeonardoImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'leonardo' as const;

  constructor(private readonly leonardoAiService: LeonardoAIService) {}

  supports(model: string): boolean {
    return model === MODEL_KEYS.LEONARDOAI;
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'LeonardoAIService generateImage',
      additionalPlaceholderFailureLabel: 'LeonardoAI',
      completionKind: 'poll-single',
      failureLabel: 'LeonardoAIService generateImage',
      generate: async () => {
        const generationId = await this.leonardoAiService.generateImage(
          request.prompt,
          {
            ...request.createImageDto,
            height: request.height,
            style: request.style || 'realistic',
            width: request.width,
          },
        );
        if (!generationId) {
          throw new Error('No generation ID returned from LeonardoAI');
        }
        return { externalId: generationId, kind: 'external-id' };
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
