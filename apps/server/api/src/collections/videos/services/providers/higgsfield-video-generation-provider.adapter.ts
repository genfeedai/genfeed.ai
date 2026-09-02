import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { calculateAspectRatio } from '@genfeedai/helpers';
import { BadRequestException } from '@nestjs/common';

/**
 * Higgsfield video is image-to-video only. `HiggsFieldService.generateImageToVideo`
 * queues the job and `waitForCompletion` polls it internally, so this adapter
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
    return model === MODEL_KEYS.HIGGSFIELD_KLING_VIDEO;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    if (!params.imageUrl) {
      throw new BadRequestException(
        'Higgsfield video generation requires a source imageUrl',
      );
    }

    const { requestId } = await this.higgsFieldService.generateImageToVideo({
      aspectRatio: calculateAspectRatio(params.width, params.height),
      duration: params.duration,
      imageUrl: params.imageUrl,
      modelId: params.model,
      organizationId: params.organizationId,
      prompt: params.prompt,
    });

    const { videoUrl } = await this.higgsFieldService.waitForCompletion(
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
