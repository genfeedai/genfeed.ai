import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { buildMaiImageFalInput } from '@api/collections/images/services/providers/mai-image-fal-input.util';
import { getFalEndpointFromModelKey } from '@api/collections/models/utils/model-key.util';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import {
  adaptFalImageRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@api/services/integrations/fal/services/fal-contract';
import { falEnqueueArgs } from '@api/services/integrations/fal/services/fal-request-ref';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

@Traced()
@Injectable()
export class FalImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

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
    const endpoint =
      request.modelEndpoint ?? getFalEndpointFromModelKey(request.model);
    const input =
      request.routedInput ??
      buildMaiImageFalInput(endpoint, {
        height: request.height,
        prompt: request.prompt,
        referenceImageUrls: request.referenceImageUrls,
        width: request.width,
      }) ??
      (request.modelSchemaFamily && request.modelInputSchema
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
        : legacyInput);

    return {
      tracksSubmissionStarted: true,
      additionalActivityFailure: 'ignore',
      additionalFailureLabel: 'FalService generateImage (additional output)',
      additionalPlaceholderFailureLabel: 'Fal',
      completionKind: 'background-only',
      failureLabel: 'FalService generateImage',
      generate: async () => {
        const result = await this.falService.generateImage(
          endpoint,
          input,
          request.apiKeyOverride,
          request.onProviderSubmissionStarted,
          ...falEnqueueArgs(request.onProviderJobQueued),
        );
        return {
          ...(request.isRoutedOffer ? { outputUrls: [result.url] } : {}),
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
