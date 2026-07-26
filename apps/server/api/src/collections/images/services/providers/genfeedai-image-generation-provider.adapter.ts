import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { isGenfeedAiDestination } from '@api/collections/models/utils/model-key.util';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GenfeedAiImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'genfeedai' as const;

  constructor(private readonly comfyUIService: ComfyUIService) {}

  supports(model: string): boolean {
    return isGenfeedAiDestination(model);
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'ComfyUIService generateImage',
      additionalPlaceholderFailureLabel: 'ComfyUI',
      completionKind: 'inline',
      failureLabel: 'ComfyUIService generateImage',
      generate: async () => {
        const { imageBuffer } = await this.comfyUIService.generateImage(
          request.model,
          {
            faceImage: request.referenceImageUrl || undefined,
            height: request.height,
            prompt: request.prompt,
            seed: request.createImageDto.seed,
            width: request.width,
          },
        );
        return { imageBuffer, kind: 'inline-buffer' };
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
