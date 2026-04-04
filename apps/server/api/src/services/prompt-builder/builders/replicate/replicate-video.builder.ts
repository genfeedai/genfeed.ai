import { BaseReplicateBuilder } from '@api/services/prompt-builder/builders/replicate/base-replicate.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  KlingAvatarV2Input,
  KlingMasterInput,
  KlingV3OmniVideoInput,
  KlingV3VideoInput,
  KlingV16ProInput,
  KlingV21Input,
  PVideoInput,
  ReplicateVideoInput,
  Sora2Input,
  Sora2ProInput,
  Veo2Input,
  Veo3Input,
  Veo31FastInput,
  Veo31Input,
  WanVideoInput,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelKey } from '@genfeedai/enums';
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
  getSupportedModels(): ModelKey[] {
    return [
      // OpenAI Sora
      ModelKey.REPLICATE_OPENAI_SORA_2,
      ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
      // Google Veo
      ModelKey.REPLICATE_GOOGLE_VEO_2,
      ModelKey.REPLICATE_GOOGLE_VEO_3,
      ModelKey.REPLICATE_GOOGLE_VEO_3_FAST,
      ModelKey.REPLICATE_GOOGLE_VEO_3_1,
      ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST,
      // WAN Video
      ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
      // PrunaAI
      ModelKey.REPLICATE_PRUNAAI_P_VIDEO,
      // Kwaivgi Kling
      ModelKey.REPLICATE_KWAIVGI_KLING_V2_1,
      ModelKey.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
      ModelKey.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
      ModelKey.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
      ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
      ModelKey.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
    ];
  }

  buildPrompt(
    model: ModelKey,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateVideoInput {
    const negativePrompt = this.getNegativePrompt(params.blacklist);

    switch (model) {
      case ModelKey.REPLICATE_OPENAI_SORA_2:
        return this.buildSora2Prompt(params, promptText);

      case ModelKey.REPLICATE_OPENAI_SORA_2_PRO:
        return this.buildSora2ProPrompt(params, promptText);

      case ModelKey.REPLICATE_GOOGLE_VEO_2:
        return this.buildVeo2Prompt(params, promptText);

      case ModelKey.REPLICATE_GOOGLE_VEO_3:
      case ModelKey.REPLICATE_GOOGLE_VEO_3_FAST:
        return this.buildVeo3Prompt(params, promptText, negativePrompt);

      case ModelKey.REPLICATE_GOOGLE_VEO_3_1:
        return this.buildVeo31Prompt(params, promptText, negativePrompt);

      case ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST:
        return this.buildVeo31FastPrompt(params, promptText, negativePrompt);

      case ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST:
        return this.buildWanVideoPrompt(model, params, promptText);

      case ModelKey.REPLICATE_PRUNAAI_P_VIDEO:
        return this.buildPVideoPrompt(model, params, promptText);

      case ModelKey.REPLICATE_KWAIVGI_KLING_V2_1:
        return this.buildKlingV21Prompt(params, promptText, negativePrompt);

      case ModelKey.REPLICATE_KWAIVGI_KLING_V2_1_MASTER:
      case ModelKey.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO:
        return this.buildKlingMasterPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case ModelKey.REPLICATE_KWAIVGI_KLING_V1_6_PRO:
        return this.buildKlingV16ProPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO:
        return this.buildKlingV3Prompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case ModelKey.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO:
        return this.buildKlingV3OmniPrompt(
          model,
          params,
          promptText,
          negativePrompt,
        );

      case ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2:
        return this.buildKlingAvatarV2Prompt(params, promptText);

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
      ModelKey.REPLICATE_OPENAI_SORA_2,
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
      ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
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
      ModelKey.REPLICATE_GOOGLE_VEO_2,
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
      ModelKey.REPLICATE_GOOGLE_VEO_3,
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
      ModelKey.REPLICATE_GOOGLE_VEO_3_1,
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
      ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST,
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
    model: ModelKey,
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
    model: ModelKey,
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
    model: ModelKey,
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
    model: ModelKey,
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
    model: ModelKey,
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
    model: ModelKey,
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
}
