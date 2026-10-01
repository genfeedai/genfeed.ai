import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import {
  isGenjutsuModel,
  resolveDopEndpoint,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { BadRequestException } from '@nestjs/common';

const GENJUTSU_POLL_TIMEOUT_MS = 600_000;

function httpsUrls(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.startsWith('https://'),
  );
}

/**
 * Higgsfield video is DoP image-to-video or Genjutsu motion transfer.
 * Both paths poll to a video URL and return `remote-output`, matching Fal:
 * execution only consumes `externalId`.
 */
export class HiggsFieldVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'higgsfield' as const;

  constructor(private readonly higgsFieldService: HiggsFieldService) {}

  supports(model: string): boolean {
    return resolveDopEndpoint(model) !== undefined || isGenjutsuModel(model);
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    if (isGenjutsuModel(params.model)) {
      return this.generateMotionTransfer(params);
    }

    if (!params.imageUrl) {
      throw new BadRequestException(
        'Higgsfield video generation requires a source imageUrl',
      );
    }

    // DoP derives framing and length from the source image, so `width`,
    // `height` and `duration` have no input to map onto.
    const { requestId } = await this.higgsFieldService.generateImageToVideo({
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
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

  private async generateMotionTransfer(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const imageUrls = [
      ...new Set([
        ...httpsUrls(params.promptParams.image_url),
        ...httpsUrls(params.promptParams.image_urls),
        ...httpsUrls(params.imageUrl),
      ]),
    ];
    const videoUrl = httpsUrls(params.promptParams.reference_video)[0];
    if (!videoUrl || imageUrls.length < 1 || imageUrls.length > 8) {
      throw new BadRequestException(
        'Higgsfield Genjutsu requires a source video and 1 to 8 character images.',
      );
    }

    const resolution = params.promptParams.resolution;
    const { requestId } = await this.higgsFieldService.generateMotionTransfer({
      imageUrls,
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      organizationId: params.organizationId,
      prompt: params.prompt,
      ...(typeof resolution === 'string' ? { resolution } : {}),
      videoUrl,
    });
    const completed = await this.higgsFieldService.waitForVideoCompletion(
      requestId,
      {
        organizationId: params.organizationId,
        timeoutMs: GENJUTSU_POLL_TIMEOUT_MS,
      },
    );

    return {
      completion: 'remote-output',
      externalId: completed.videoUrl,
      provider: this.provider,
    };
  }
}
