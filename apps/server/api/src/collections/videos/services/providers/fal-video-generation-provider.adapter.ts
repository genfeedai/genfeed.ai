import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@api/collections/models/utils/model-key.util';
import type {
  DispatchVideoGenerationParams,
  PreparedFalVideoDispatch,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import {
  adaptFalVideoRequest,
  type FalJsonSchema,
  type FalSchemaFamily,
} from '@api/services/integrations/fal/services/fal-contract';
import type { ModelProvider } from '@genfeedai/contracts';
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

export function prepareFalVideoDispatch(
  params: DispatchVideoGenerationParams,
): PreparedFalVideoDispatch {
  const endpoint = getFalEndpointFromModelKey(
    params.modelEndpoint ?? params.model,
  );
  if (
    /^(?:bytedance\/seedance-|fal-ai\/bytedance\/seedance\/)/.test(endpoint) &&
    params.modelSchemaFamily &&
    params.modelInputSchema
  ) {
    const schema = params.modelInputSchema as FalJsonSchema;
    const promptParams = { ...params.promptParams };
    for (const field of [
      'resolution',
      'aspect_ratio',
      'duration',
      'generate_audio',
    ]) {
      const property = schema.properties?.[field];
      if (property?.const !== undefined) {
        promptParams[field] = property.const;
        continue;
      }
      if (promptParams[field] === undefined && property?.default !== undefined)
        promptParams[field] = property.default;
    }
    // Drafts are always 480p regardless of the requested final resolution.
    if (promptParams.draft === true) promptParams.resolution = '480p';
    const input = adaptFalVideoRequest(
      params.modelSchemaFamily as FalSchemaFamily,
      schema,
      {
        duration: params.duration,
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        promptParams,
      },
    );
    if (
      /^bytedance\/seedance-2\.5\/(?:us\/)?reference-to-video$/.test(endpoint)
    ) {
      if (input.task === 'editing') input.duration = 'auto';
      if (input.task === 'editing' || input.task === 'extension')
        input.aspect_ratio = 'auto';
    }
    return { endpoint, input };
  }
  if (endpoint === GEMINI_OMNI_FLASH_ENDPOINT) {
    const firstImage =
      optionalString(params.promptParams.image_url) ?? params.imageUrl;
    const referenceImages = [
      ...new Set([
        firstImage,
        ...optionalStringArray(params.promptParams.image_urls),
      ]),
    ].filter((value): value is string => Boolean(value));
    const aspectRatio = optionalString(params.promptParams.aspect_ratio);
    const duration =
      optionalNumber(params.promptParams.duration) ?? params.duration;
    const input: Record<string, unknown> = {
      prompt: optionalString(params.promptParams.prompt) ?? params.prompt,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(duration ? { duration } : {}),
    };
    if (referenceImages.length > 1)
      return {
        endpoint: `${endpoint}/reference-to-video`,
        input: { ...input, image_urls: referenceImages },
      };
    if (firstImage)
      return {
        endpoint: `${endpoint}/image-to-video`,
        input: { ...input, image_url: firstImage },
      };
    return { endpoint, input };
  }
  if (endpoint === MINIMAX_H3_MAX_TEXT_ENDPOINT) {
    const firstImage =
      optionalString(params.promptParams.image_url) ?? params.imageUrl;
    const endImage = optionalString(params.promptParams.end_image_url);
    const requestedAspectRatio = optionalString(
      params.promptParams.aspect_ratio,
    );
    const requestedResolution = optionalString(params.promptParams.resolution);
    const requestedExpansion = optionalString(
      params.promptParams.prompt_expansion_mode,
    );
    const input = {
      duration: optionalNumber(params.promptParams.duration) ?? params.duration,
      enable_safety_checker:
        optionalBoolean(params.promptParams.enable_safety_checker) ?? true,
      prompt: optionalString(params.promptParams.prompt) ?? params.prompt,
      prompt_expansion_mode: ['balanced', 'quality'].includes(
        requestedExpansion ?? '',
      )
        ? requestedExpansion
        : 'balanced',
      resolution: ['480P', '768P', '1080P'].includes(requestedResolution ?? '')
        ? requestedResolution
        : '768P',
      ...(optionalNumber(params.promptParams.seed) !== undefined
        ? { seed: optionalNumber(params.promptParams.seed) }
        : {}),
    };
    if (firstImage)
      return {
        endpoint: 'minimax/h3-max/image-to-video',
        input: {
          ...input,
          image_url: firstImage,
          ...(endImage ? { end_image_url: endImage } : {}),
        },
      };
    return {
      endpoint,
      input: {
        ...input,
        aspect_ratio: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(
          requestedAspectRatio ?? '',
        )
          ? requestedAspectRatio
          : '16:9',
      },
    };
  }
  return {
    endpoint,
    input:
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
        : {
            prompt: params.prompt,
            ...(params.duration && { duration: params.duration }),
            ...(params.imageUrl && { image_url: params.imageUrl }),
          },
  };
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
    const dispatch =
      params.preparedFalDispatch ?? prepareFalVideoDispatch(params);
    const result = await this.falService.generateVideo(
      dispatch.endpoint,
      dispatch.input,
      params.apiKeyOverride,
      params.onProviderSubmissionStarted,
    );
    return {
      completion: 'remote-output',
      externalId: result.url,
      provider: this.provider,
    };
  }
}
