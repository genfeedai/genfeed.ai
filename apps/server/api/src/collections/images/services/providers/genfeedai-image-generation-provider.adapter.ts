import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

const RESULT_DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * `genfeed-ai/*` image models. They run on the images runtime that console
 * operates (`GPU_IMAGES_URL`, or the organization's dedicated runtime). A
 * self-hosted install without that runtime can point `COMFYUI_URL` at its own
 * ComfyUI server instead.
 */
@Injectable()
export class GenfeedAiImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'genfeedai' as const;

  constructor(
    private readonly managedInferenceRuntimeService: ManagedInferenceRuntimeService,
    private readonly comfyUIService: ComfyUIService,
    private readonly mediaUrlService: MediaUrlService,
  ) {}

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'GenfeedAI generateImage',
      additionalPlaceholderFailureLabel: 'Genfeed AI',
      completionKind: 'inline',
      failureLabel: 'GenfeedAI generateImage',
      generate: async () => ({
        imageBuffer: await this.generateImage(request),
        kind: 'inline-buffer',
      }),
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }

  private async generateImage(
    request: ImageGenerationProviderRequest,
  ): Promise<Buffer> {
    const loraPath = request.createImageDto.loraPath;
    const runtimeUrl =
      await this.managedInferenceRuntimeService.getInstanceUrlForOrg(
        request.organizationId,
        'images',
      );

    if (runtimeUrl) {
      const { resultUrl } =
        await this.managedInferenceRuntimeService.generateImage({
          height: request.height,
          ...(loraPath ? { loraPath } : {}),
          model: request.model,
          organizationId: request.organizationId,
          prompt: request.prompt,
          ...(request.referenceImageUrl
            ? { referenceImageUrl: request.referenceImageUrl }
            : {}),
          seed: request.createImageDto.seed,
          width: request.width,
        });
      const response = await axios.get<ArrayBuffer>(
        this.mediaUrlService.buildUrlFromAbsolute(resultUrl),
        { responseType: 'arraybuffer', timeout: RESULT_DOWNLOAD_TIMEOUT_MS },
      );
      return Buffer.from(response.data);
    }

    if (this.comfyUIService.isConfigured()) {
      const { imageBuffer } = await this.comfyUIService.generateImage(
        request.model,
        {
          faceImage: request.referenceImageUrl || undefined,
          height: request.height,
          ...(loraPath ? { loraPath } : {}),
          prompt: request.prompt,
          seed: request.createImageDto.seed,
          width: request.width,
        },
      );
      return imageBuffer;
    }

    throw new Error(
      'Genfeed AI image models need GPU_IMAGES_URL or COMFYUI_URL to be configured',
    );
  }
}
