import { BaseReplicateBuilder } from '@api/services/prompt-builder/builders/replicate/base-replicate.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  Gen45Input,
  GrokImagineVideoInput,
  Hailuo23FastInput,
  Hailuo23Input,
  KlingAvatarV2Input,
  KlingMasterInput,
  KlingO1Input,
  KlingV3OmniVideoInput,
  KlingV3VideoInput,
  KlingV16ProInput,
  KlingV21Input,
  KlingV26Input,
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
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  calculateAspectRatio,
  convertRatioToOrientation,
  DurationUtil,
  normalizeAspectRatioForModel,
} from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';

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
        return this.buildKlingV21Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER:
      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO:
        return this.buildKlingMasterPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO:
        return this.buildKlingV16ProPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO:
        return this.buildKlingV3Prompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO:
        return this.buildKlingV3OmniPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2:
        return this.buildKlingAvatarV2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0:
      case MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST:
        return this.buildSeedance2Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6:
        return this.buildPixVerseV6Prompt(params, promptText, negativePrompt);

      case MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO:
        return this.buildGrokImagineVideoPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5:
        return this.buildGen45Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6:
        return this.buildKlingV26Prompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1:
        return this.buildKlingO1Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3:
        return this.buildHailuo23Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST:
        return this.buildHailuo23FastPrompt(params, promptText);

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
        return this.buildVeo31LitePrompt(params, promptText);

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

  private buildKlingV21Prompt(
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingV21Input {
    if (!params.references || params.references.length === 0) {
      throw new Error(
        'start_image is required for Kling V2.1 model. Please provide a reference image.',
      );
    }

    const allowedDurations = [5, 10];
    const duration =
      params.duration && allowedDurations.includes(params.duration)
        ? params.duration
        : 5;

    const mode = params.endFrame ? 'pro' : 'standard';

    const input: KlingV21Input = {
      duration: duration,
      mode: mode,
      prompt: promptText,
      start_image: params.references[0],
    };

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.endFrame) {
      input.end_image = params.endFrame;
    }

    return input;
  }

  private buildKlingMasterPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingMasterInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const allowedDurations = [5, 10];
    const duration =
      params.duration && allowedDurations.includes(params.duration)
        ? params.duration
        : 5;

    const input: KlingMasterInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
    };

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.references && params.references.length > 0) {
      input.start_image = params.references[0];
    }

    return input;
  }

  private buildKlingV16ProPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingV16ProInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const allowedDurations = [5, 10];
    const duration =
      params.duration && allowedDurations.includes(params.duration)
        ? params.duration
        : 5;

    const input: KlingV16ProInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
    };

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.references && params.references.length > 0) {
      input.start_image = params.references[0];
    }

    if (params.endFrame) {
      input.end_image = params.endFrame;
    }

    if (params.references && params.references.length > 1) {
      input.reference_images = params.references.slice(1, 5);
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

  private buildKlingV3Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingV3VideoInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const duration = Math.min(Math.max(params.duration ?? 5, 3), 15);

    const mode = this.configService.isDevelopment ? 'standard' : 'pro';

    const input: KlingV3VideoInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      mode: mode,
      prompt: promptText,
    };

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.references && params.references.length > 0) {
      input.start_image = params.references[0];
    }

    if (params.endFrame) {
      input.end_image = params.endFrame;
    }

    return input;
  }

  private buildKlingV3OmniPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingV3OmniVideoInput {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const duration = Math.min(Math.max(params.duration ?? 5, 3), 15);

    const mode = this.configService.isDevelopment ? 'standard' : 'pro';

    const input: KlingV3OmniVideoInput = {
      aspect_ratio: aspectRatio,
      duration: duration,
      mode: mode,
      prompt: promptText,
    };

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    // Reference images: up to 7
    if (params.references && params.references.length > 1) {
      input.reference_images = params.references.slice(0, 7);
    } else if (params.references && params.references.length === 1) {
      input.start_image = params.references[0];
    }

    if (params.endFrame) {
      input.end_image = params.endFrame;
    }

    if (params.video) {
      input.reference_video = params.video;
      input.video_reference_type = 'feature';
    }

    return input;
  }

  private buildKlingAvatarV2Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): KlingAvatarV2Input {
    if (!params.references || params.references.length === 0) {
      throw new Error(
        'Portrait image is required for Kling Avatar V2. Please provide a reference image.',
      );
    }

    if (!params.audioUrl) {
      throw new Error(
        'Audio file is required for Kling Avatar V2. Please provide an audio URL.',
      );
    }

    const input: KlingAvatarV2Input = {
      audio: params.audioUrl,
      image: params.references[0],
    };

    if (promptText) {
      input.prompt = promptText;
    }

    return input;
  }

  private buildSeedance2Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Seedance2Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = calculatedRatio || '16:9';

    const input: Seedance2Input = {
      aspect_ratio: aspectRatio,
      duration: params.duration ?? 5,
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.references && params.references.length > 0) {
      input.image = params.references[0];
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

  private buildKlingV26Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
    negativePrompt: string,
  ): KlingV26Input {
    const calculatedRatio = calculateAspectRatio(params.width, params.height);
    const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

    const allowedDurations = [5, 10];
    const duration =
      params.duration && allowedDurations.includes(params.duration)
        ? params.duration
        : 5;

    const input: KlingV26Input = {
      aspect_ratio: aspectRatio,
      duration: duration,
      prompt: promptText,
    };

    if (params.isAudioEnabled !== undefined) {
      input.generate_audio = params.isAudioEnabled;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (params.references && params.references.length > 0) {
      input.start_image = params.references[0];
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildKlingO1Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): KlingO1Input {
    const duration = Math.min(Math.max(params.duration ?? 5, 3), 10);

    const input: KlingO1Input = {
      duration: duration,
      prompt: promptText,
    };

    if (params.references && params.references.length > 0) {
      input.reference_images = params.references.slice(0, 4);
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildHailuo23Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Hailuo23Input {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(aspectRatio, [
      '16:9',
      '9:16',
      '1:1',
    ]);
    const duration = DurationUtil.clampToAllowed(params.duration ?? 6, [6, 10]);

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
    params: PromptBuilderParams,
    promptText: string,
  ): Hailuo23FastInput {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(aspectRatio, [
      '16:9',
      '9:16',
      '1:1',
    ]);
    const duration = DurationUtil.clampToAllowed(params.duration ?? 6, [6, 10]);

    const input: Hailuo23FastInput = {
      aspect_ratio: normalizedRatio,
      duration: duration,
      image: params.references?.[0] ?? '',
      prompt: promptText,
    };

    if (params.resolution) {
      input.resolution = params.resolution;
    }

    if (params.seed !== undefined) {
      input.seed = params.seed;
    }

    return input;
  }

  private buildViduQ3Prompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ViduQ3Input {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(aspectRatio, [
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '1:1',
    ]);
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
    const normalizedRatio = normalizeAspectRatioForModel(aspectRatio, [
      '16:9',
      '9:16',
      '1:1',
      '4:3',
      '3:4',
    ]);
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
    params: PromptBuilderParams,
    promptText: string,
  ): Veo31LiteInput {
    const aspectRatio = calculateAspectRatio(params.width, params.height);
    const normalizedRatio = normalizeAspectRatioForModel(aspectRatio, [
      '16:9',
      '9:16',
    ]);
    const duration = DurationUtil.clampToAllowed(
      params.duration ?? 8,
      [4, 6, 8],
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
