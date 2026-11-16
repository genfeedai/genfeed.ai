import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import {
  isCinemaStudioModel,
  isGenjutsuModel,
  isGenjutsuObjectSwapModel,
  isGenjutsuRestyleModel,
  resolveDopEndpoint,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { BadRequestException } from '@nestjs/common';

const GENJUTSU_POLL_TIMEOUT_MS = 600_000;
// Up to 30s of 720p video with reference media renders slower than DoP.
const CINEMA_STUDIO_POLL_TIMEOUT_MS = 900_000;

function httpsUrls(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.startsWith('https://'),
  );
}

// Cinema Studio takes caller-supplied reference media, so a bad entry fails the
// request instead of being silently dropped and generating without it.
function strictHttpsUrls(field: string, value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.startsWith('https://')) {
      throw new BadRequestException(
        `Higgsfield Cinema Studio ${field} must be https URLs`,
      );
    }
  }
  return entries as string[];
}

/**
 * Higgsfield video is DoP image-to-video, Genjutsu motion transfer or
 * Cinema Studio 4.0 text/reference-to-video. All paths poll to a video URL and return `remote-output`, matching Fal:
 * execution only consumes `externalId`.
 */
export class HiggsFieldVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'higgsfield' as const;

  constructor(private readonly higgsFieldService: HiggsFieldService) {}

  supports(model: string): boolean {
    return (
      resolveDopEndpoint(model) !== undefined ||
      isGenjutsuModel(model) ||
      isGenjutsuObjectSwapModel(model) ||
      isGenjutsuRestyleModel(model) ||
      isCinemaStudioModel(model)
    );
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    if (isGenjutsuModel(params.model)) {
      return this.generateGenjutsuEdit(params, 'motion-transfer');
    }
    if (isGenjutsuObjectSwapModel(params.model)) {
      return this.generateGenjutsuEdit(params, 'object-swap');
    }
    if (isGenjutsuRestyleModel(params.model)) {
      return this.generateRestyle(params);
    }
    if (isCinemaStudioModel(params.model)) {
      return this.generateCinemaStudio(params);
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

  private async generateGenjutsuEdit(
    params: DispatchVideoGenerationParams,
    workflow: 'motion-transfer' | 'object-swap',
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
    const submit =
      workflow === 'object-swap'
        ? this.higgsFieldService.generateObjectSwap.bind(this.higgsFieldService)
        : this.higgsFieldService.generateMotionTransfer.bind(
            this.higgsFieldService,
          );
    const { requestId } = await submit({
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

  private async generateRestyle(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const { promptParams } = params;
    const videoUrl = httpsUrls(promptParams.reference_video)[0];
    const presetId = promptParams.preset_id;
    if (!videoUrl || typeof presetId !== 'string') {
      throw new BadRequestException(
        'Higgsfield Genjutsu restyle requires a source video and a style preset id.',
      );
    }
    const imageUrls = [
      ...new Set([
        ...httpsUrls(promptParams.image_url),
        ...httpsUrls(promptParams.image_urls),
        ...httpsUrls(params.imageUrl),
      ]),
    ];
    const resolution = promptParams.resolution;

    const { requestId } = await this.higgsFieldService.generateRestyle({
      imageUrls,
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      organizationId: params.organizationId,
      presetId,
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

  private async generateCinemaStudio(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const { promptParams } = params;
    const imageUrls = [
      ...new Set([
        ...strictHttpsUrls('image_urls', promptParams.image_urls),
        ...strictHttpsUrls('imageUrl', params.imageUrl),
      ]),
    ];
    const videoUrls = strictHttpsUrls(
      'reference_video_urls',
      promptParams.reference_video_urls,
    );
    const audioUrls = strictHttpsUrls('audio_urls', promptParams.audio_urls);
    const duration =
      typeof promptParams.duration === 'number'
        ? promptParams.duration
        : params.duration;
    const { aspect_ratio: aspectRatio, resolution } = promptParams;

    const { requestId } =
      await this.higgsFieldService.generateCinemaStudioVideo({
        ...(typeof aspectRatio === 'string' ? { aspectRatio } : {}),
        ...(audioUrls.length > 0 ? { audioUrls } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(typeof promptParams.generate_audio === 'boolean'
          ? { generateAudio: promptParams.generate_audio }
          : {}),
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        onProviderSubmissionStarted: params.onProviderSubmissionStarted,
        organizationId: params.organizationId,
        prompt: params.prompt,
        ...(typeof resolution === 'string' ? { resolution } : {}),
        ...(videoUrls.length > 0 ? { videoUrls } : {}),
      });
    const completed = await this.higgsFieldService.waitForVideoCompletion(
      requestId,
      {
        organizationId: params.organizationId,
        timeoutMs: CINEMA_STUDIO_POLL_TIMEOUT_MS,
      },
    );

    return {
      completion: 'remote-output',
      externalId: completed.videoUrl,
      provider: this.provider,
    };
  }
}
