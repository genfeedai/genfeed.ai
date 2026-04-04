import { BaseReplicateBuilder } from '@api/services/prompt-builder/builders/replicate/base-replicate.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  MusicGenInput,
  ReplicateMediaInput,
  TopazImageUpscaleInput,
  TopazVideoUpscaleInput,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelKey } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

/**
 * Replicate media model prompt builder.
 * Handles: MusicGen and Topaz upscale models.
 */
@Injectable()
export class ReplicateMediaBuilder extends BaseReplicateBuilder {
  getSupportedModels(): ModelKey[] {
    return [
      ModelKey.REPLICATE_META_MUSICGEN,
      ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
    ];
  }

  buildPrompt(
    model: ModelKey,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateMediaInput {
    switch (model) {
      case ModelKey.REPLICATE_META_MUSICGEN:
        return this.buildMusicGenPrompt(params, promptText);

      case ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE:
        return this.buildTopazImageUpscalePrompt(params);

      case ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE:
        return this.buildTopazVideoUpscalePrompt(params);

      default:
        throw new Error(`Unsupported media model: ${model}`);
    }
  }

  private buildMusicGenPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): MusicGenInput {
    return {
      classifier_free_guidance: 3,
      continuation: false,
      continuation_start: 0,
      duration: params.duration ?? 8,
      model_version: 'stereo-large',
      normalization_strategy: 'loudness',
      output_format: 'mp3',
      prompt: promptText,
      seed: params.seed ?? -1,
      temperature: 1,
      top_k: 250,
      top_p: 0,
    };
  }

  private buildTopazImageUpscalePrompt(
    params: PromptBuilderParams,
  ): TopazImageUpscaleInput {
    return {
      enhance_model: params.enhanceModel || 'Low Resolution V2',
      face_enhancement: params.faceEnhancement !== false,
      face_enhancement_creativity: params.faceEnhancementCreativity ?? 0.5,
      face_enhancement_strength: params.faceEnhancementStrength ?? 0.8,
      image: params.references?.[0],
      output_format: params.outputFormat || 'jpg',
      subject_detection: params.subjectDetection || 'Foreground',
      upscale_factor: params.upscaleFactor || '4x',
    };
  }

  private buildTopazVideoUpscalePrompt(
    params: PromptBuilderParams,
  ): TopazVideoUpscaleInput {
    return {
      target_fps: params.target_fps,
      target_resolution: params.target_resolution,
      video: params.video,
    };
  }
}
