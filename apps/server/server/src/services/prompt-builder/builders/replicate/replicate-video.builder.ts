import { MODEL_KEYS } from '@genfeedai/constants';
import {
  calculateAspectRatio,
  convertRatioToOrientation,
  DurationUtil,
  normalizeAspectRatioForModel,
} from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';
import { BaseReplicateBuilder } from '@server/services/prompt-builder/builders/replicate/base-replicate.builder';
import {
  buildKlingAvatarV2Prompt,
  buildKlingMasterPrompt,
  buildKlingO1Prompt,
  buildKlingV3OmniPrompt,
  buildKlingV3Prompt,
  buildKlingV16ProPrompt,
  buildKlingV21Prompt,
  buildKlingV26Prompt,
} from '@server/services/prompt-builder/builders/replicate/replicate-video-kling-input.builder';
import type { PromptBuilderParams } from '@server/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  Gen45Input,
  GrokImagineVideoInput,
  Hailuo23FastInput,
  Hailuo23Input,
  MinimaxH3Input,
  PixVerseV6Input,
  PVideoInput,
  ReplicateVideoInput,
  Seedance2Input,
  Sora2Input,
  Sora2ProInput,
  Veo2Input,
  Veo3Input,
  Veo31FastInput,
  Veo31Input,
  Veo31LiteInput,
  ViduQ3Input,
  Wan27T2VInput,
  WanVideoInput,
} from '@server/services/prompt-builder/interfaces/replicate-input.interface';
import { assertRequiredSchemaInput } from '@server/services/prompt-builder/utils/replicate-schema.util';

/**
 * Replicate video model prompt builder.
 * Handles: Sora, Veo, WAN Video, and Kling models.
 */
@Injectable()
export class ReplicateVideoBuilder extends BaseReplicateBuilder {
  getSupportedModels(): string[] {
    return [
      // OpenAI Sora
      MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
      MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
      // Google Veo
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
      // WAN Video
      MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
      // PrunaAI
      MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
      // Kwaivgi Kling
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
      // ByteDance Seedance
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0,
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      // PixVerse
      MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6,
      // xAI Grok
      MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
      // RunwayML
      MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5,
      // Kling V2.6 / O1
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1,
      // Minimax Hailuo
      MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
      MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      MODEL_KEYS.REPLICATE_MINIMAX_H3,
      // Vidu
      MODEL_KEYS.REPLICATE_VIDU_Q3_PRO,
      MODEL_KEYS.REPLICATE_VIDU_Q3_TURBO,
      // WAN Video 2.7
      MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V,
      // Google Veo 3.1 Lite
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
    ];
  }

  buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateVideoInput {
    const negativePrompt = this.getNegativePrompt(params.blacklist);

    switch (model) {
      case MODEL_KEYS.REPLICATE_OPENAI_SORA_2:
        return this.buildSora2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO:
        return this.buildSora2ProPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_2:
        return this.buildVeo2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_3:
      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST:
        return this.buildVeo3Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1:
        return this.buildVeo31Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST:
        return this.buildVeo31FastPrompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST:
        return this.buildWanVideoPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO:
        return this.buildPVideoPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1:
        return buildKlingV21Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER:
      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO:
        return buildKlingMasterPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO:
        return buildKlingV16ProPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO:
        return buildKlingV3Prompt(
          model,
          params,
          promptText,
          negativePrompt,
          this.configService.isDevelopment ? 'standard' : 'pro',
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO:
        return buildKlingV3OmniPrompt(
          model,
          params,
          promptText,
          negativePrompt,
          this.configService.isDevelopment ? 'standard' : 'pro',
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2:
        return buildKlingAvatarV2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0:
      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST:
      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5:
        return this.buildSeedance2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6:
        return this.buildPixVerseV6Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO:
        return this.buildGrokImagineVideoPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5:
        return this.buildGen45Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6:
        return buildKlingV26Prompt(model, params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1:
        return buildKlingO1Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3:
        return this.buildHailuo23Prompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST:
        return this.buildHailuo23FastPrompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_MINIMAX_H3:
        return this.buildMinimaxH3Prompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_VIDU_Q3_PRO:
      case MODEL_KEYS.REPLICATE_VIDU_Q3_TURBO:
        return this.buildViduQ3Prompt(model, params, promptText);

      case MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V:
        return this.buildWan27T2VPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE:
        return this.buildVeo31LitePrompt(model, params, promptText);

      default:
        throw new Error(`Unsupported video model: ${model}`);
    }
  }

  private buildSora2Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Sora2Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
      calculatedRatio,
    );
    const aspectRatio = convertRatioToOrientation(normalizedRatio);
    const seconds = DurationUtil.validateSoraDuration(params.duration);

    const input: Sora2Input = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
      seconds: seconds,
    };

    if (params.references && params.references.length > 0) {
      input.input_reference = params.references[0];
    }

    return input;
  }

  private buildSora2ProPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Sora2ProInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
      calculatedRatio,
    );
    const aspectRatio = convertRatioToOrientation(normalizedRatio);
    const seconds = DurationUtil.validateSoraDuration(params.duration);

    const allowedResolutions = ['standard', 'high'];
    const resolution =
      params.resolution && allowedResolutions.includes(params.resolution)
        ? params.resolution
        : 'standard';

    const input: Sora2ProInput = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
      resolution: resolution,
      seconds: seconds,
    };

    if (params.references && params.references.length > 0) {
      input.input_reference = params.references[0];
    }

    return input;
  }

  private buildVeo2Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Veo2Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
      calculatedRatio,
    );

    const input: Veo2Input = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 5,
      prompt: promptText,
      seed: params.seed ?? -1,
    };

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildVeo3Prompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): Veo3Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      calculatedRatio,
    );

    const input: Veo3Input = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 8,
      generate_audio: params.isAudioEnabled ?? true,
      negative_prompt: negativePrompt,
      prompt: promptText,
      resolution: this.normalizeVeoResolution(params.resolution),
      seed: params.seed ?? -1,
    };

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildVeo31Prompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): Veo31Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
      calculatedRatio,
    );

    const normalizedResolution = params.resolution
      ? this.normalizeVeoResolution(params.resolution)
      : this.configService.isDevelopment
        ? '720p'
        : '1080p';

    const input: Veo31Input = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 8,
      generate_audio: params.isAudioEnabled ?? true,
      negative_prompt: negativePrompt,
      prompt: promptText,
      resolution: normalizedResolution,
    };

    if (params?.seed) {
      input.seed = params.seed;
    }

    // Reference images: R2V (2-3 images) > I2V + interpolation > I2V
    if (params?.references && params?.references?.length > 1) {
      input.reference_images = params?.references?.slice(0, 3);
    } else if (params.references?.[0]) {
      input.image = params.references[0];
      if (params.endFrame) {
        input.last_frame = params.endFrame;
      }
    }

    return input;
  }

  private buildVeo31FastPrompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): Veo31FastInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
      calculatedRatio,
    );

    const normalizedResolution = params.resolution
      ? this.normalizeVeoResolution(params.resolution)
      : this.configService.isDevelopment
        ? '720p'
        : '1080p';

    const input: Veo31FastInput = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 8,
      generate_audio: params.isAudioEnabled ?? true,
      negative_prompt: negativePrompt,
      prompt: promptText,
      resolution: normalizedResolution,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    // I2V + interpolation only (NO R2V support)
    if (params.references?.[0]) {
      input.image = params.references[0];
      if (params.endFrame) {
        input.last_frame = params.endFrame;
      }
    }

    return input;
  }

  private buildWanVideoPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): WanVideoInput {
    const imageReference = params.references?.[0];

    if (!imageReference) {
      throw new Error(
        'image is required for WAN Video 2.2 I2V Fast model. Please provide a reference image in params.references[0]',
      );
    }

    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const input: WanVideoInput = {
      aspect_ratio: aspectRatio,
      disable_safety_checker: false,
      frames_per_second: 16,
      go_fast: true,
      image: imageReference,
      num_frames: 81,
      prompt: promptText,
      resolution: this.normalizeWanResolution(params.resolution),
      sample_shift: 12,
    };

    if (params.endFrame) {
      input.last_image = params.endFrame;
    }

    if (params.seed !== undefined && params.seed !== null) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildPVideoPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): PVideoInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const duration = Math.min(Math.max(params.duration ?? 5, 1), 10);

    const input: PVideoInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
      prompt_upsampling: true,
    };

    if (params.resolution) {
      input.resolution = params.resolution === 'high' ? '1080p' : '720p';
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildSeedance2Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Seedance2Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = calculatedRatio || '16:9';

    // Cap duration: 2.0 family historically 5–15; 2.5 allows 4–30. Clamp to
    // the safe 2.5 upper bound so a rogue 60s request cannot explode cost.
    const rawDuration = params.duration ?? 5;
    const duration = Math.min(Math.max(rawDuration, 4), 30);

    const input: Seedance2Input = {
      aspect_ratio: aspectRatio,
      duration,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    if (params.endFrame) {
      input.last_frame = params.endFrame;
    }

    if (params.seed !== undefined && params.seed !== null) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildPixVerseV6Prompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): PixVerseV6Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6,
      calculatedRatio,
    );

    const duration = Math.min(Math.max(params.duration ?? 5, 5), 15);

    const input: PixVerseV6Input = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio_switch = params.isAudioEnabled;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    if (params.endFrame) {
      input.last_frame_image = params.endFrame;
    }

    return input;
  }

  private buildGrokImagineVideoPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): GrokImagineVideoInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
      calculatedRatio,
    );

    const duration = Math.min(Math.max(params.duration ?? 5, 1), 15);

    const input: GrokImagineVideoInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (params.resolution) {
      input.resolution = params.resolution === 'high' ? '720p' : '480p';
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildGen45Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Gen45Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(
      MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5,
      calculatedRatio,
    );

    const input: Gen45Input = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 5,
      prompt: promptText,
    };

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    return input;
  }

  private buildHailuo23Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Hailuo23Input {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(model, aspectRatio);
    const duration = DurationUtil.validateAndNormalize(
      params.duration,
      [6, 10],
      6,
    );

    const input: Hailuo23Input = {
      aspect_ratio: normalizedRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildHailuo23FastPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Hailuo23FastInput {
    const duration = DurationUtil.validateAndNormalize(
      params.duration,
      [6, 10],
      6,
    );
    const firstFrameImage = params.references?.[0]?.trim() ?? '';
    const input: Hailuo23FastInput = {
      duration,
      first_frame_image: firstFrameImage,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    assertRequiredSchemaInput(model, input, params.modelInputSchema);
    return input;
  }

  private buildMinimaxH3Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): MinimaxH3Input {
    const firstFrame = params.references?.[0];
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const ratio = firstFrame
      ? 'adaptive'
      : normalizeAspectRatioForModel(model, calculatedRatio);
    const duration = Math.min(
      Math.max(Math.round(params.duration ?? 5), 4),
      15,
    );
    const resolution =
      params.resolution?.toUpperCase() === '768P' ? '768P' : '2K';

    const input: MinimaxH3Input = {
      duration,
      prompt: promptText,
      ratio,
      reference_audio_urls: params.audioUrl ? [params.audioUrl] : [],
      reference_image_urls: params.references?.slice(1, 10) ?? [],
      reference_video_urls: params.video ? [params.video] : [],
      resolution,
    };

    if (firstFrame) {
      input.first_frame_image = firstFrame;
    }

    if (params.endFrame) {
      input.last_frame_image = params.endFrame;
    }

    return input;
  }

  private buildViduQ3Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ViduQ3Input {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(model, aspectRatio);
    const duration = Math.min(Math.max(params.duration ?? 8, 1), 16);

    const input: ViduQ3Input = {
      aspect_ratio: normalizedRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (params.references && params.references.length > 0) {
      input.start_image = params.references[0];
    }

    if (params.endFrame) {
      input.end_image = params.endFrame;
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildWan27T2VPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): Wan27T2VInput {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(model, aspectRatio);
    const duration = Math.min(Math.max(params.duration ?? 5, 2), 15);

    const input: Wan27T2VInput = {
      aspect_ratio: normalizedRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildVeo31LitePrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): Veo31LiteInput {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(model, aspectRatio);
    const duration = DurationUtil.validateAndNormalize(
      params.duration,
      [4, 6, 8],
      8,
    );

    const input: Veo31LiteInput = {
      aspect_ratio: normalizedRatio,
      duration: duration,
      prompt: promptText,
      resolution: params.resolution ?? '720p',
    };

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }
}
