import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { resolveDopEndpoint } from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Higgsfield video is image-to-video only (DoP). `HiggsFieldService.generateImageToVideo`
 * queues the job and `waitForVideoCompletion` polls it, so this adapter
 * blocks on the whole round trip and returns the resolved video URL directly —
 * the same synchronous "remote-output" pattern used by
 * {@link FalVideoGenerationProviderAdapter} for Fal, since `VideoGenerationExecutionService.dispatch`
 * only ever consumes `externalId` and never branches on `completion`.
 */
export class HiggsFieldVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'higgsfield' as const;

  constructor(private readonly higgsFieldService: HiggsFieldService) {}

  supports(model: string): boolean {
    return resolveDopEndpoint(model) !== undefined;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    if (!params.imageUrl) {
      throw new BadRequestException(
        'Higgsfield video generation requires a source imageUrl',
      );
    }

    // DoP derives framing and length from the source image, so `width`,
    // `height` and `duration` have no input to map onto.
    const { requestId } = await this.higgsFieldService.generateImageToVideo({
      imageUrl: params.imageUrl,
      modelKey: params.model,
      organizationId: params.organizationId,
      prompt: params.prompt,
    });

    const { videoUrl } = await this.higgsFieldService.waitForVideoCompletion(
      requestId,
      { organizationId: params.organizationId },
    );

    return {
      completion: 'remote-output',
      externalId: videoUrl,
      provider: this.provider,
    };
  }
}
