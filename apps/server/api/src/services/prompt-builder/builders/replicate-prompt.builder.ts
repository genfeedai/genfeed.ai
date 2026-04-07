// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ConfigService } from '@api/config/config.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { BasePromptBuilder } from '@api/services/prompt-builder/builders/base-prompt.builder';
import {
  ReplicateImageBuilder,
  ReplicateMediaBuilder,
  ReplicateTextBuilder,
  ReplicateVideoBuilder,
} from '@api/services/prompt-builder/builders/replicate';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  ReplicateInput,
  TrainedModelInput,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelProvider } from '@genfeedai/enums';
import {
  calculateAspectRatio,
  getDefaultAspectRatio,
} from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';

// Derived allowlist of all Replicate models defined in the shared MODEL_KEYS constant.
// We key off constant *names* (e.g. "REPLICATE_*") because the values are model IDs (e.g. "replicate/...").
const replicateModels: string[] = (
  Object.entries(MODEL_KEYS) as Array<[string, string]>
)
  .filter(([key]) => key.startsWith('REPLICATE_'))
  .map(([, value]) => value);

/**
 * Replicate-specific prompt builder - Facade
 * Delegates to specialized builders for different model types:
 * - ReplicateVideoBuilder: Sora, Veo, WAN, Kling
 * - ReplicateImageBuilder: Imagen, Nano Banana, Ideogram, SeeDream, FLUX, Qwen, RunwayML, Luma
 * - ReplicateMediaBuilder: MusicGen, Topaz
 * - ReplicateTextBuilder: DeepSeek, GPT, Gemini, Llama
 *
 * @see services/integrations/replicate/README.md for complete model documentation
 * @see services/integrations/replicate/schemas/ for official Replicate API schemas
 */
@Injectable()
export class ReplicatePromptBuilder extends BasePromptBuilder {
  private readonly videoBuilder: ReplicateVideoBuilder;
  private readonly imageBuilder: ReplicateImageBuilder;
  private readonly mediaBuilder: ReplicateMediaBuilder;
  private readonly textBuilder: ReplicateTextBuilder;

  constructor(private readonly configService: ConfigService) {
    super();
    this.videoBuilder = new ReplicateVideoBuilder(configService);
    this.imageBuilder = new ReplicateImageBuilder(configService);
    this.mediaBuilder = new ReplicateMediaBuilder(configService);
    this.textBuilder = new ReplicateTextBuilder(configService);
  }

  getProvider(): ModelProvider {
    return ModelProvider.REPLICATE;
  }

  /**
   * Determines whether the given model is supported by the Replicate provider.
   *
   * Best practice:
   * - Always check for a known list first (replicateModels array for allowlist)
   * - Avoid relying on ModelKey key names, as the enum key-string may change or be minified
   * - For custom/trained models, permit if the model string contains the configured REPLICATE_OWNER
   */
  supportsModel(model: string): boolean {
    if (model === DEFAULT_TEXT_MODEL || this.textBuilder.supportsModel(model)) {
      return true;
    }

    // 1. Allow explicit allowlist of known Replicate models (best for safety)
    if (replicateModels.includes(model)) {
      return true;
    }

    // 2. Allow models where the model ID (string) includes the configured REPLICATE_OWNER (handles finetunes/custom)
    const replicateOwner = this.configService.get('REPLICATE_OWNER');
    if (
      typeof replicateOwner === 'string' &&
      replicateOwner.length > 0 &&
      model.includes(replicateOwner)
    ) {
      return true;
    }

    // 3. Fallback: defensively check if this model's enum key includes 'REPLICATE_' prefix.
    //    This is less robust if enums are not fully trusted, but adds flexibility for future additions.
    //    Only use as fallback, not primary check!
    const modelKeyName = (
      Object.entries(MODEL_KEYS) as Array<[string, string]>
    ).find(([, value]) => value === model)?.[0];

    if (modelKeyName?.startsWith('REPLICATE_')) {
      return true;
    }

    // None matched
    return false;
  }

  buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateInput {
    // Delegate to specialized builders.
    // ORDER MATTERS: image builder is checked LAST because its supportsModel()
    // returns true for everything (generic fallback). More specific builders
    // (video, media, text) must be checked first.
    if (this.videoBuilder.supportsModel(model)) {
      return this.videoBuilder.buildPrompt(model, params, promptText);
    }

    if (this.mediaBuilder.supportsModel(model)) {
      return this.mediaBuilder.buildPrompt(model, params, promptText);
    }

    if (this.textBuilder.supportsModel(model)) {
      return this.textBuilder.buildPrompt(model, params, promptText);
    }

    // Image builder is the catch-all: accepts any model and uses
    // schema-driven generic prompt building for unknown models.
    if (this.imageBuilder.supportsModel(model)) {
      return this.imageBuilder.buildPrompt(model, params, promptText);
    }

    // Handle trained models or unknown models
    const replicateOwner = this.configService.get('REPLICATE_OWNER');
    if (replicateOwner && model.includes(replicateOwner)) {
      return this.buildTrainedModelPrompt(model, params, promptText);
    }

    // Fallback: build a trained-model-style input from params
    return this.buildTrainedModelPrompt(model, params, promptText);
  }

  private buildTrainedModelPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): TrainedModelInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);

    const input: TrainedModelInput = {
      aspect_ratio: calculatedRatio || getDefaultAspectRatio(model),
      disable_safety_checker: true,
      num_outputs: params.outputs ?? 1,
      output_format: params.outputFormat ?? 'jpg',
      output_quality: 80,
      prompt: promptText,
      seed: params.seed ?? -1,
    };

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }
}
