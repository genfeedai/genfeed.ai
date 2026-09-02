import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@api/collections/models/utils/model-key.util';
import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import {
  adaptFalVideoRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@api/services/integrations/fal/services/fal-contract';
import type { ModelProvider } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

const GEMINI_OMNI_FLASH_ENDPOINT = 'google/gemini-omni-flash';
const MINIMAX_H3_MAX_TEXT_ENDPOINT = 'minimax/h3-max/text-to-video';

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

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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
    if (endpoint === MINIMAX_H3_MAX_TEXT_ENDPOINT) {
      return this.generateMiniMaxH3Max(params);
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

  private async generateMiniMaxH3Max(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const firstImage =
      optionalString(params.promptParams.image_url) ?? params.imageUrl;
    const endImage = optionalString(params.promptParams.end_image_url);
    const duration =
      optionalNumber(params.promptParams.duration) ?? params.duration;
    const prompt = optionalString(params.promptParams.prompt) ?? params.prompt;
    const requestedAspectRatio = optionalString(
      params.promptParams.aspect_ratio,
    );
    const aspectRatio = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(
      requestedAspectRatio ?? '',
    )
      ? requestedAspectRatio
      : '16:9';
    const requestedResolution = optionalString(params.promptParams.resolution);
    const resolution = ['480P', '768P'].includes(requestedResolution ?? '')
      ? requestedResolution
      : '768P';
    const requestedExpansionMode = optionalString(
      params.promptParams.prompt_expansion_mode,
    );
    const promptExpansionMode = ['balanced', 'quality'].includes(
      requestedExpansionMode ?? '',
    )
      ? requestedExpansionMode
      : 'balanced';
    const seed = optionalNumber(params.promptParams.seed);
    const enableSafetyChecker =
      optionalBoolean(params.promptParams.enable_safety_checker) ?? true;
    const commonInput = {
      duration,
      enable_safety_checker: enableSafetyChecker,
      prompt,
      prompt_expansion_mode: promptExpansionMode,
      resolution,
      ...(seed !== undefined ? { seed } : {}),
    };
    const destination = firstImage
      ? 'minimax/h3-max/image-to-video'
      : MINIMAX_H3_MAX_TEXT_ENDPOINT;
    const input = firstImage
      ? {
          ...commonInput,
          ...(endImage ? { end_image_url: endImage } : {}),
          image_url: firstImage,
        }
      : { ...commonInput, aspect_ratio: aspectRatio };

    const result = await this.falService.generateVideo(destination, input);
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }
}
