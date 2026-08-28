import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import type { ModelProvider } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@server/collections/models/utils/model-key.util';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import {
  adaptFalVideoRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@server/services/integrations/fal/services/fal-contract';

const GEMINI_OMNI_FLASH_ENDPOINT = 'google/gemini-omni-flash';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.length > 0,
      )
    : [];
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

@Injectable()
export class FalVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string, provider?: ModelProvider | string): boolean {
    return isFalDestination(model, provider);
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const endpoint = getFalEndpointFromModelKey(
      params.modelEndpoint ?? params.model,
    );
    if (endpoint === GEMINI_OMNI_FLASH_ENDPOINT) {
      return this.generateGeminiOmniFlash(params, endpoint);
    }

    const legacyInput = {
      prompt: params.prompt,
      ...(params.duration && { duration: params.duration }),
      ...(params.imageUrl && { image_url: params.imageUrl }),
    };
    const input =
      params.modelSchemaFamily && params.modelInputSchema
        ? adaptFalVideoRequest(
            params.modelSchemaFamily as FalSchemaFamily,
            params.modelInputSchema as FalJsonSchema,
            {
              duration: params.duration,
              imageUrl: params.imageUrl,
              prompt: params.prompt,
              promptParams: params.promptParams,
            },
          )
        : legacyInput;
    const result = await this.falService.generateVideo(endpoint, input);
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }

  private async generateGeminiOmniFlash(
    params: DispatchVideoGenerationParams,
    endpoint: string,
  ): Promise<VideoGenerationProviderResult> {
    const aspectRatio = optionalString(params.promptParams.aspect_ratio);
    const firstImage =
      optionalString(params.promptParams.image_url) ?? params.imageUrl;
    const extraImages = optionalStringArray(params.promptParams.image_urls);
    const referenceImages = [...new Set([firstImage, ...extraImages])].filter(
      (value): value is string => Boolean(value),
    );
    const duration =
      optionalNumber(params.promptParams.duration) ?? params.duration;
    const prompt = optionalString(params.promptParams.prompt) ?? params.prompt;
    const commonInput = {
      prompt,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(duration ? { duration } : {}),
    };
    let destination = endpoint;
    let input: Record<string, unknown> = commonInput;
    if (referenceImages.length > 1) {
      destination = `${endpoint}/reference-to-video`;
      input = { ...commonInput, image_urls: referenceImages };
    } else if (firstImage) {
      destination = `${endpoint}/image-to-video`;
      input = { ...commonInput, image_url: firstImage };
    }

    const result = await this.falService.generateVideo(destination, input);
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }
}
