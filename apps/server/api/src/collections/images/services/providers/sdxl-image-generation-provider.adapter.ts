import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SdxlImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'sdxl' as const;

  async prepare(
    _request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'SDXL generateImage',
      additionalPlaceholderFailureLabel: 'SDXL',
      completionKind: 'none',
      failureLabel: 'SDXL generateImage',
      generate: async () => {
        throw new Error('SDXL does not start an external generation');
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
