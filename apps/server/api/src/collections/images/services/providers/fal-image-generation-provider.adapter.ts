import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { isFalDestination } from '@api/collections/models/utils/model-key.util';
import { Injectable } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';

@Injectable()
export class FalImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string): boolean {
    return isFalDestination(model);
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    const input = {
      image_size: {
        height: request.height,
        width: request.width,
      },
      ...(request.referenceImageUrl
        ? { image_url: request.referenceImageUrl }
        : {}),
      ...(request.createImageDto.seed !== undefined
        ? { seed: request.createImageDto.seed }
        : {}),
      prompt: request.prompt,
    };

    return {
      additionalActivityFailure: 'ignore',
      additionalFailureLabel: 'FalService generateImage (additional output)',
      additionalPlaceholderFailureLabel: 'Fal',
      completionKind: 'background-only',
      failureLabel: 'FalService generateImage',
      generate: async () => {
        const result = await this.falService.generateImage(
          request.model,
          input,
        );
        return {
          externalId: result.url,
          kind: 'external-id',
          promptId: request.promptId,
        };
      },
      outputStrategy: 'sequential',
      trackAdditionalOutputsInResponse: true,
    };
  }
}
