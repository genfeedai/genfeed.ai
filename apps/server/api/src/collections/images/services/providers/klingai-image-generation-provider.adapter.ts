import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class KlingAiImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'klingai' as const;

  constructor(private readonly klingAIService: KlingAIService) {}

  supports(model: string): boolean {
    return model === MODEL_KEYS.KLINGAI_V2;
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'KlingAIService generateImage',
      additionalPlaceholderFailureLabel: 'KlingAI',
      completionKind: 'poll-single',
      failureLabel: 'KlingAIService generateImage',
      generate: async () => {
        const generationId = await this.klingAIService.queueGenerateImage(
          request.prompt,
          {
            ...request.createImageDto,
            height: request.height,
            model: request.model,
            reference: request.referenceImageUrl || undefined,
            style: request.style || 'realistic',
            width: request.width,
          },
        );
        if (!generationId) {
          throw new Error('No generation ID returned from KlingAI');
        }
        return {
          externalId: generationId,
          kind: 'external-id',
          promptId: request.promptId,
        };
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
