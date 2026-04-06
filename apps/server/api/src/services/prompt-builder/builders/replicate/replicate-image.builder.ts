import { BaseReplicateBuilder } from '@api/services/prompt-builder/builders/replicate/base-replicate.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  Flux2DevInput,
  Flux2FlexInput,
  Flux2ProInput,
  Flux11ProInput,
  FluxKontextProInput,
  FluxSchnellInput,
  Gen4ImageTurboInput,
  GenericImageInput,
  IdeogramCharacterInput,
  IdeogramV3Input,
  ImagenInput,
  LumaReframeImageInput,
  LumaReframeVideoInput,
  NanoBananaInput,
  NanoBananaProInput,
  QwenImageInput,
  ReplicateImageInput,
  SeeDream4Input,
  SeeDream45Input,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import {
  detectImageReferenceFields,
  getArrayImageLimit,
  isArrayImageField,
  loadModelSchema,
  schemaHasField,
} from '@api/services/prompt-builder/utils/replicate-schema.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  calculateAspectRatio,
  getDefaultAspectRatio,
  normalizeAspectRatioForModel,
} from '@genfeedai/helpers';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Replicate image model prompt builder.
 * Handles: Imagen, Nano Banana, Ideogram, SeeDream, FLUX, Qwen, RunwayML Gen4, Luma models,
 * plus a generic fallback for auto-discovered image models.
 */
@Injectable()
export class ReplicateImageBuilder extends BaseReplicateBuilder {
  private readonly logger = new Logger(ReplicateImageBuilder.name);

  /** Models with dedicated builder methods (switch-case routing) */
  private static readonly DEDICATED_MODELS = new Set<string>([
    // Google Imagen
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
    // Google Nano Banana
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    // Ideogram
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
    // ByteDance SeeDream
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
    // Black Forest Labs FLUX
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    // Qwen
    MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE,
    // RunwayML
    MODEL_KEYS.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO,
    // Luma
    MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
    MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
  ]);

  getSupportedModels(): string[] {
    return [...ReplicateImageBuilder.DEDICATED_MODELS];
  }

  /**
   * Returns true for dedicated models AND any model key (generic fallback).
   * This allows new DB-only models to use the generic builder without enum entries.
   */
  supportsModel(_model: string): boolean {
    return true;
  }

  buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateImageInput {
    const negativePrompt =
      params.negativePrompt ?? this.getNegativePrompt(params.blacklist);

    // Dedicated builders for models with quirky APIs
    if (ReplicateImageBuilder.DEDICATED_MODELS.has(model)) {
      return this.buildDedicatedPrompt(
        model,
        params,
        promptText,
        negativePrompt,
      );
    }

    // Generic fallback for auto-discovered / new models
    this.logger.log(`Using generic builder for model: ${model}`);
    return this.buildGenericImagePrompt(model, params, promptText);
  }

  private buildDedicatedPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): ReplicateImageInput {
    switch (model) {
      // Google Imagen
      case MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3:
      case MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST:
      case MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4:
      case MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST:
      case MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA:
        return this.buildImagenPrompt(model, params, promptText);

      // Google Nano Banana
      case MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA:
        return this.buildNanoBananaPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO:
        return this.buildNanoBananaProPrompt(model, params, promptText);

      // Ideogram
      case MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER:
        return this.buildIdeogramCharacterPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED:
      case MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY:
      case MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO:
        return this.buildIdeogramV3Prompt(model, params, promptText);

      // ByteDance SeeDream
      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4:
        return this.buildSeeDream4Prompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5:
        return this.buildSeeDream45Prompt(model, params, promptText);

      // FLUX
      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO:
        return this.buildFlux11ProPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV:
        return this.buildFlux2DevPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO:
        return this.buildFlux2ProPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX:
        return this.buildFlux2FlexPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO:
        return this.buildFluxKontextProPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL:
        return this.buildFluxSchnellPrompt(model, params, promptText);

      // Qwen
      case MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE:
        return this.buildQwenImagePrompt(params, promptText, negativePrompt);

      // RunwayML
      case MODEL_KEYS.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO:
        return this.buildGen4ImageTurboPrompt(model, params, promptText);

      // Luma
      case MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE:
        return this.buildLumaReframeImagePrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO:
        return this.buildLumaReframeVideoPrompt(model, params, promptText);

      default:
        return this.buildGenericImagePrompt(model, params, promptText);
    }
  }

  /**
   * Generic image prompt builder for auto-discovered models.
   * When a schema JSON is available (synced via sync-replicate-schemas.ts),
   * conditionally includes fields based on schema presence.
   * Without a schema, falls back to safe defaults.
   */
  private buildGenericImagePrompt(
    model: string | string,
    params: PromptBuilderParams,
    promptText: string,
  ): GenericImageInput {
    const schema = loadModelSchema(model);

    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: GenericImageInput = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
    };

    // output_format: include when no schema, or when schema explicitly has it
    if (!schema || schemaHasField(schema, 'output_format')) {
      input.output_format = params.outputFormat ?? 'jpg';
    }

    // seed: include when param is provided AND (no schema OR schema has it)
    if (params.seed !== undefined) {
      if (!schema || schemaHasField(schema, 'seed')) {
        input.seed = params.seed;
      }
    }

    // resolution: include when param is provided AND (no schema OR schema has it)
    if (params.resolution) {
      if (!schema || schemaHasField(schema, 'resolution')) {
        input.resolution = params.resolution;
      }
    }

    // safety_filter_level: only include when schema explicitly has it
    if (schema && schemaHasField(schema, 'safety_filter_level')) {
      input.safety_filter_level = 'block_only_high';
    }

    // Map image references using schema-aware field detection
    if (hasImageInput) {
      this.mapImageReferences(input, params.references!, schema);
    }

    return input;
  }

  /**
   * Maps image references to the correct input field based on schema detection.
   * - With schema: uses detected field name (array or single-value)
   * - Without schema: falls back to `image_input` (most common pattern)
   */
  private mapImageReferences(
    input: GenericImageInput,
    references: string[],
    schema: ReturnType<typeof loadModelSchema>,
  ): void {
    if (!schema) {
      input.image_input = references;
      return;
    }

    const refFields = detectImageReferenceFields(schema);
    if (refFields.length === 0) {
      // Schema exists but has no recognized image reference field — drop refs
      return;
    }

    const primaryField = refFields[0];
    if (isArrayImageField(schema, primaryField)) {
      const limit = getArrayImageLimit(schema, primaryField);
      (input as Record<string, unknown>)[primaryField] = limit
        ? references.slice(0, limit)
        : references;
    } else {
      (input as Record<string, unknown>)[primaryField] = references[0];
    }
  }

  private buildImagenPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ImagenInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      model,
      calculatedRatio || getDefaultAspectRatio(model),
    );

    return {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'jpg',
      prompt: promptText,
      safety_filter_level: 'block_only_high',
    };
  }

  private buildNanoBananaPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): NanoBananaInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: NanoBananaInput = {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'jpg',
      prompt: promptText,
    };

    if (hasImageInput) {
      input.image_input = params.references;
    }

    return input;
  }

  private buildNanoBananaProPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): NanoBananaProInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: NanoBananaProInput = {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'jpg',
      prompt: promptText,
      safety_filter_level: 'block_only_high',
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (hasImageInput) {
      input.image_input = params.references?.slice(0, 14);
    }

    return input;
  }

  private buildIdeogramCharacterPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): IdeogramCharacterInput {
    const characterReferenceImage = params.references?.[0];

    if (!characterReferenceImage) {
      throw new Error(
        'character_reference_image is required for Ideogram Character model. Please provide a reference image in params.references[0]',
      );
    }

    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio = calculatedAspectRatio || getDefaultAspectRatio(model);

    const input: IdeogramCharacterInput = {
      aspect_ratio: aspectRatio,
      character_reference_image: characterReferenceImage,
      magic_prompt_option: 'Auto',
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    return input;
  }

  private buildIdeogramV3Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): IdeogramV3Input {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio = calculatedAspectRatio || getDefaultAspectRatio(model);

    const input: IdeogramV3Input = {
      aspect_ratio: aspectRatio,
      magic_prompt_option: 'Auto',
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildSeeDream4Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): SeeDream4Input {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: SeeDream4Input = {
      aspect_ratio: aspectRatio,
      enhance_prompt: true,
      prompt: promptText,
    };

    if (hasImageInput) {
      input.image_input = params.references?.slice(0, 10);
    }

    return input;
  }

  private buildSeeDream45Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): SeeDream45Input {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: SeeDream45Input = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
      size: '2K',
    };

    if (hasImageInput) {
      input.image_input = params.references?.slice(0, 14);
    }

    return input;
  }

  private buildFlux11ProPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Flux11ProInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'custom' : getDefaultAspectRatio(model));

    const input: Flux11ProInput = {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'webp',
      output_quality: 80,
      prompt: promptText,
      prompt_upsampling: false,
      safety_tolerance: 2,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (hasImageInput) {
      input.image_prompt = params.references?.[0];
    }

    if (aspectRatio === 'custom') {
      input.width = params.width ?? 1024;
      input.height = params.height ?? 1024;
    }

    return input;
  }

  private buildFlux2DevPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Flux2DevInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: Flux2DevInput = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: false,
      go_fast: false,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (hasImageInput) {
      input.input_images = params.references?.slice(0, 4);
    }

    if (aspectRatio === 'custom') {
      input.width = params.width ?? 1024;
      input.height = params.height ?? 1024;
    }

    return input;
  }

  private buildFlux2ProPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Flux2ProInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: Flux2ProInput = {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
      safety_tolerance: 2,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.resolution && params.resolution !== 'match_input_image') {
      input.resolution = params.resolution;
    } else if (hasImageInput) {
      input.resolution = this.configService.isDevelopment ? '0.5 MP' : '1 MP';
    }

    if (hasImageInput) {
      input.input_images = params.references?.slice(0, 8);
    }

    if (aspectRatio === 'custom') {
      input.width = params.width ?? 1024;
      input.height = params.height ?? 1024;
    }

    return input;
  }

  private buildFlux2FlexPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Flux2FlexInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: Flux2FlexInput = {
      aspect_ratio: aspectRatio,
      guidance: 4.5,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
      prompt_upsampling: true,
      safety_tolerance: 2,
      steps: 30,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.resolution && params.resolution !== 'match_input_image') {
      input.resolution = params.resolution;
    } else if (hasImageInput) {
      input.resolution = this.configService.isDevelopment ? '0.5 MP' : '1 MP';
    }

    if (hasImageInput) {
      input.input_images = params.references?.slice(0, 10);
    }

    if (aspectRatio === 'custom') {
      input.width = params.width ?? 1024;
      input.height = params.height ?? 1024;
    }

    return input;
  }

  private buildFluxKontextProPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): FluxKontextProInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const hasImageInput = params.references && params.references.length > 0;
    const aspectRatio =
      calculatedAspectRatio ||
      (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model));

    const input: FluxKontextProInput = {
      aspect_ratio: aspectRatio,
      output_format: params.outputFormat ?? 'jpg',
      prompt: promptText,
      prompt_upsampling: false,
      safety_tolerance: 2,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (hasImageInput) {
      input.input_image = params.references?.[0];
    }

    return input;
  }

  private buildFluxSchnellPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): FluxSchnellInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio = calculatedAspectRatio || getDefaultAspectRatio(model);

    const input: FluxSchnellInput = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: false,
      go_fast: true,
      num_inference_steps: 4,
      num_outputs: params.outputs ?? 1,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildQwenImagePrompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): QwenImageInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio =
      calculatedAspectRatio ||
      getDefaultAspectRatio(MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE);

    const input: QwenImageInput = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: false,
      enhance_prompt: false,
      go_fast: true,
      guidance: 3,
      negative_prompt: negativePrompt || ' ',
      num_inference_steps: 30,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
      input.strength = params.strength ?? 0.9;
    }

    return input;
  }

  private buildGen4ImageTurboPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Gen4ImageTurboInput {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio = calculatedAspectRatio || getDefaultAspectRatio(model);

    const input: Gen4ImageTurboInput = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
      resolution: params.resolution ?? '1080p',
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.references && params.references.length > 0) {
      input.reference_images = params.references.slice(0, 3);
    }

    return input;
  }

  private buildLumaReframeImagePrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): LumaReframeImageInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      model,
      calculatedRatio || getDefaultAspectRatio(model),
    );

    return {
      aspect_ratio: aspectRatio,
      image: params.references?.[0],
      model: 'photon-flash-1',
      prompt: promptText,
    };
  }

  private buildLumaReframeVideoPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): LumaReframeVideoInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      model,
      calculatedRatio || getDefaultAspectRatio(model),
    );

    return {
      aspect_ratio: aspectRatio,
      prompt: promptText,
      video: params.video || params.references?.[0],
    };
  }
}
