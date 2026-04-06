import { ModelCategory } from '@genfeedai/enums';
import { ASPECT_RATIOS } from './model-aspect-ratios.constant';
import { MODEL_KEYS } from './model-keys.constant';

export type ModelCapabilityCategory =
  | ModelCategory.TEXT
  | ModelCategory.EMBEDDING
  | ModelCategory.IMAGE
  | ModelCategory.IMAGE_EDIT
  | ModelCategory.IMAGE_UPSCALE
  | ModelCategory.VIDEO
  | ModelCategory.VIDEO_EDIT
  | ModelCategory.VIDEO_UPSCALE
  | ModelCategory.MUSIC
  | ModelCategory.VOICE;

export interface BaseModelCapability {
  category: ModelCapabilityCategory;
  maxOutputs: number;
  isBatchSupported: boolean;
  maxReferences: number;
}

export interface ImageModelCapability extends BaseModelCapability {
  category: ModelCategory.IMAGE;
  isReferencesMandatory?: boolean;
  isImagenModel?: boolean;
  aspectRatios?: readonly string[];
  defaultAspectRatio?: string;
}

export interface VideoModelCapability extends BaseModelCapability {
  category: ModelCategory.VIDEO;
  hasEndFrame?: boolean;
  hasInterpolation?: boolean;
  hasSpeech?: boolean;
  hasAudioToggle?: boolean;
  hasDurationEditing?: boolean;
  hasResolutionOptions?: boolean;
  aspectRatios?: readonly string[];
  defaultAspectRatio?: string;
  usesOrientation?: boolean;
  durations?: readonly number[];
  defaultDuration?: number;
}

export interface TextModelCapability extends BaseModelCapability {
  category: ModelCategory.TEXT;
}

export interface EmbeddingModelCapability extends BaseModelCapability {
  category: ModelCategory.EMBEDDING;
}

export interface ImageEditModelCapability extends BaseModelCapability {
  category: ModelCategory.IMAGE_EDIT;
  aspectRatios?: readonly string[];
  defaultAspectRatio?: string;
}

export interface ImageUpscaleModelCapability extends BaseModelCapability {
  category: ModelCategory.IMAGE_UPSCALE;
  maxUpscaleFactor?: number;
}

export interface VideoEditModelCapability extends BaseModelCapability {
  category: ModelCategory.VIDEO_EDIT;
  hasDurationEditing?: boolean;
  aspectRatios?: readonly string[];
  defaultAspectRatio?: string;
  durations?: readonly number[];
  defaultDuration?: number;
}

export interface VideoUpscaleModelCapability extends BaseModelCapability {
  category: ModelCategory.VIDEO_UPSCALE;
  maxUpscaleFactor?: number;
}

export interface MusicModelCapability extends BaseModelCapability {
  category: ModelCategory.MUSIC;
  hasDurationEditing?: boolean;
  durations?: readonly number[];
  defaultDuration?: number;
}

export interface VoiceModelCapability extends BaseModelCapability {
  category: ModelCategory.VOICE;
  hasDurationEditing?: boolean;
  aspectRatios?: readonly string[];
  defaultAspectRatio?: string;
  durations?: readonly number[];
  defaultDuration?: number;
}

export type ModelOutputCapability =
  | ImageModelCapability
  | ImageEditModelCapability
  | ImageUpscaleModelCapability
  | VideoModelCapability
  | VideoEditModelCapability
  | VideoUpscaleModelCapability
  | TextModelCapability
  | EmbeddingModelCapability
  | MusicModelCapability
  | VoiceModelCapability;

export const MODEL_OUTPUT_CAPABILITIES: Record<string, ModelOutputCapability> =
  {
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA]: {
      aspectRatios: ASPECT_RATIOS.NANO_BANANA,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 15,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO]: {
      aspectRatios: ASPECT_RATIOS.NANO_BANANA,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 14,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2]: {
      aspectRatios: ASPECT_RATIOS.NANO_BANANA_2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 14,
    },
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4]: {
      aspectRatios: ASPECT_RATIOS.SEEDREAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5]: {
      aspectRatios: ASPECT_RATIOS.SEEDREAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: true,
      maxOutputs: 4,
      maxReferences: 14,
    },
    [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER]: {
      aspectRatios: ASPECT_RATIOS.IDEOGRAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED]: {
      aspectRatios: ASPECT_RATIOS.IDEOGRAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 4,
    },
    [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY]: {
      aspectRatios: ASPECT_RATIOS.IDEOGRAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 4,
    },
    [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO]: {
      aspectRatios: ASPECT_RATIOS.IDEOGRAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 4,
    },

    // Black Forest Labs Models
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV]: {
      aspectRatios: ASPECT_RATIOS.FLUX_V2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 4,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX]: {
      aspectRatios: ASPECT_RATIOS.FLUX_V2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_V2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 8,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_KONTEXT,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL]: {
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_2]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 6, 7, 8],
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 3,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5]: {
      aspectRatios: ['1:1', '3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 10,
    },

    [MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE]: {
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO]: {
      aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 3,
    },

    [MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER]: {
      aspectRatios: ['1:1', '9:16', '16:9', '3:4', '4:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: true,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE]: {
      aspectRatios: ASPECT_RATIOS.LUMA_REFRAME,
      category: ModelCategory.IMAGE_EDIT,
      defaultAspectRatio: '9:16',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.LUMA_REFRAME,
      category: ModelCategory.VIDEO_EDIT,
      defaultAspectRatio: '9:16',
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE]: {
      category: ModelCategory.IMAGE_UPSCALE,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE]: {
      category: ModelCategory.VIDEO_UPSCALE,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO]: {
      aspectRatios: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 2,
    },

    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 4,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1]: {
      aspectRatios: [],
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 7,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 10,
      durations: [5, 10, 15, 30, 60],
      hasDurationEditing: false,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_META_MUSICGEN]: {
      category: ModelCategory.MUSIC,
      defaultDuration: 10,
      durations: [5, 10, 15, 30],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.HEYGEN_AVATAR]: {
      aspectRatios: ASPECT_RATIOS.HEYGEN,
      category: ModelCategory.VOICE,
      defaultAspectRatio: '16:9',
      defaultDuration: 10,
      durations: [5, 10, 15, 30],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_SORA_2]: {
      aspectRatios: ASPECT_RATIOS.SORA,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 8, 12],
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      usesOrientation: true,
    },
    [MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO]: {
      aspectRatios: ASPECT_RATIOS.SORA,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 8, 12],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      usesOrientation: true,
    },

    [MODEL_KEYS.KLINGAI_V2]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.LEONARDOAI]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.RUNWAYML]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.SDXL]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    [MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.OPENROUTER_XAI_GROK_4_FAST]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.OPENROUTER_XAI_GROK_4]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_CLIP]: {
      category: ModelCategory.EMBEDDING,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    // fal.ai models
    [MODEL_KEYS.FAL_FLUX_DEV]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_FLUX_SCHNELL]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_FLUX_PRO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_KLING_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      hasEndFrame: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_LUMA_DREAM_MACHINE]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_RUNWAY_GEN3]: {
      aspectRatios: ASPECT_RATIOS.RUNWAY_GEN4,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 10,
      durations: [5, 10],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_SEEDANCE_2_0]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: false,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_STABLE_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 4,
      durations: [4, 8],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_WHISPER]: {
      category: ModelCategory.VOICE,
      defaultDuration: 30,
      durations: [5, 10, 30, 60],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_ELEVEN_LABS_TTS]: {
      category: ModelCategory.VOICE,
      defaultDuration: 30,
      durations: [5, 10, 30, 60],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.FAL_FACE_SWAP]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE_EDIT,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 2,
    },
    [MODEL_KEYS.FAL_UPSCALER]: {
      category: ModelCategory.IMAGE_UPSCALE,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
      maxUpscaleFactor: 4,
    },

    // HuggingFace models
    [MODEL_KEYS.HF_SDXL]: {
      aspectRatios: ASPECT_RATIOS.IMAGEN,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 0,
    },
    [MODEL_KEYS.HF_FLUX_SCHNELL]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 0,
    },
    [MODEL_KEYS.HF_LLAMA_3_2_3B]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.HF_MISTRAL_7B]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.HF_WHISPER_LARGE_V3]: {
      category: ModelCategory.VOICE,
      defaultDuration: 30,
      durations: [5, 10, 30, 60],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.HF_MMS_TTS_ENG]: {
      category: ModelCategory.VOICE,
      defaultDuration: 30,
      durations: [5, 10, 30, 60],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.HF_STABLE_VIDEO_DIFFUSION]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 4,
      durations: [4],
      hasDurationEditing: false,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    },

    // =========================================================================
    // GENFEED AI SELF-HOSTED MODELS (ComfyUI on gpu.genfeed.ai)
    // =========================================================================

    [MODEL_KEYS.GENFEED_AI_FLUX_DEV]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX_DEV_PULID]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX2_DEV]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_LORA]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_UPSCALE]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '4:5',
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 1,
      maxReferences: 1,
    },
    [MODEL_KEYS.GENFEED_AI_FLUX2_KLEIN]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
    [MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA]: {
      aspectRatios: ASPECT_RATIOS.FLUX_STANDARD,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '4:5',
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },
  };
