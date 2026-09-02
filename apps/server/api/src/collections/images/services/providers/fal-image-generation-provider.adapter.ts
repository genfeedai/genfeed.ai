import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@api/collections/models/utils/model-key.util';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import {
  adaptFalImageRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@api/services/integrations/fal/services/fal-contract';
import type { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FalImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string, provider?: ModelProvider | string): boolean {
    return isFalDestination(model, provider);
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    const legacyInput = {
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
    const input =
      request.modelSchemaFamily && request.modelInputSchema
        ? adaptFalImageRequest(
            request.modelSchemaFamily as FalSchemaFamily,
            request.modelInputSchema as FalJsonSchema,
            {
              height: request.height,
              prompt: request.prompt,
              referenceImageUrls: request.referenceImageUrls,
              seed: request.createImageDto.seed,
              width: request.width,
            },
          )
        : legacyInput;

    return {
      additionalActivityFailure: 'ignore',
      additionalFailureLabel: 'FalService generateImage (additional output)',
      additionalPlaceholderFailureLabel: 'Fal',
      completionKind: 'background-only',
      failureLabel: 'FalService generateImage',
      generate: async () => {
        const result = await this.falService.generateImage(
          request.modelEndpoint ?? getFalEndpointFromModelKey(request.model),
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
