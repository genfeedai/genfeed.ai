import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';

function httpsUrls(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.startsWith('https://'),
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined;
}

/**
 * HeyGen Video on the HeyGen v3 models API. Avatar jobs stay on
 * `HeyGenService.generateAvatarVideo` and are not claimed here.
 * The poll returns a signed URL as `remote-output`.
 */
@Injectable()
export class HeyGenVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'heygen' as const;

  constructor(private readonly heyGenService: HeyGenService) {}

  supports(model: string): boolean {
    return model === MODEL_KEYS.HEYGEN_VIDEO;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const firstFrame =
      httpsUrls(params.promptParams.image)[0] ?? httpsUrls(params.imageUrl)[0];
    const extraImages = httpsUrls(params.promptParams.reference_images);
    const imageUrls = [
      ...new Set([...(firstFrame ? [firstFrame] : []), ...extraImages]),
    ];
    const videoUrls = httpsUrls(params.promptParams.reference_video_urls);
    const duration =
      params.duration ?? optionalInteger(params.promptParams.duration);
    const seed = optionalInteger(params.promptParams.seed);
    const { videoUrl } = await this.heyGenService.generateModelVideo({
      apiKeyOverride: params.apiKeyOverride,
      aspectRatio: optionalString(params.promptParams.aspect_ratio),
      ...(duration === undefined ? {} : { duration }),
      imageUrls,
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      prompt: params.prompt,
      resolution: optionalString(params.promptParams.resolution),
      ...(seed === undefined ? {} : { seed }),
      videoUrls,
    });

    return {
      completion: 'remote-output',
      externalId: videoUrl,
      provider: this.provider,
    };
  }
}
