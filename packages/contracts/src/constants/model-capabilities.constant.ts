import { ModelCategory } from '..';
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
  /** Native OpenAPI `quality` enum for the selected model. Empty = no control. */
  qualityOptions?: readonly string[];
  /** Highest billed band. `auto` is never the default — it would undercharge. */
  defaultQuality?: string;
}

export interface VideoModelCapability extends BaseModelCapability {
  category: ModelCategory.VIDEO;
  hasEndFrame?: boolean;
  hasNativeExtend?: boolean;
  hasVideoReferences?: boolean;
  maxVideoReferences?: number;
  hasInterpolation?: boolean;
  hasSpeech?: boolean;
  hasAudioToggle?: boolean;
  hasDurationEditing?: boolean;
  hasResolutionOptions?: boolean;
  requiresFirstFrame?: boolean;
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
  /** Provider can render a purely instrumental track with no vocals. */
  supportsInstrumental?: boolean;
  /** Provider can render sung/spoken vocals over the track. */
  supportsVocals?: boolean;
  /** Provider accepts explicit lyrics/composition structure (verses, chorus). */
  supportsLyrics?: boolean;
  /** Languages the vocal model supports (empty/omitted for instrumental-only). */
  languages?: readonly string[];
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

/** OpenAPI `quality` enum for GPT Image 1.5 / 2. Highest billed band is `high`. */
export const GPT_IMAGE_QUALITY_OPTIONS = [
  'low',
  'medium',
  'high',
  'auto',
] as const;

/** OpenAPI `quality` enum for GPT Image 2.5 Flare / Sunburst. Highest billed band is `max`. */
export const GPT_IMAGE_2_5_QUALITY_OPTIONS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'auto',
] as const;

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
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE]: {
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
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE]: {
      aspectRatios: ASPECT_RATIOS.SEEDREAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: true,
      maxOutputs: 4,
      maxReferences: 14,
    },
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_PRO]: {
      aspectRatios: ASPECT_RATIOS.SEEDREAM,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 10,
    },
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0]: {
      aspectRatios: ASPECT_RATIOS.SEEDANCE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 9,
    },
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST]: {
      aspectRatios: ASPECT_RATIOS.SEEDANCE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 9,
    },
    // Flagship multimodal video (native audio, up to 30s). Expensive — prefer
    // short drafts; bill per second at the 720p-safe unit cost in the catalog.
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5]: {
      aspectRatios: ASPECT_RATIOS.SEEDANCE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [4, 5, 8, 10, 15, 20, 30],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasNativeExtend: true,
      hasResolutionOptions: true,
      hasVideoReferences: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 30,
      maxVideoReferences: 10,
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

    // Recraft Models
    [MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4]: {
      aspectRatios: ASPECT_RATIOS.RECRAFT,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4_PRO]: {
      aspectRatios: ASPECT_RATIOS.RECRAFT,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    // xAI Grok Image
    [MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_IMAGE]: {
      aspectRatios: ASPECT_RATIOS.GROK_IMAGE,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
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
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_MAX]: {
      aspectRatios: ASPECT_RATIOS.FLUX_KONTEXT,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_MAX]: {
      aspectRatios: ASPECT_RATIOS.FLUX_V2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 8,
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
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasAudioToggle: false,
      hasDurationEditing: true,
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
      defaultQuality: 'high',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 10,
      qualityOptions: GPT_IMAGE_QUALITY_OPTIONS,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2]: {
      aspectRatios: ASPECT_RATIOS.GPT_IMAGE,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      defaultQuality: 'high',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 10,
      qualityOptions: GPT_IMAGE_QUALITY_OPTIONS,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_FLARE]: {
      aspectRatios: ASPECT_RATIOS.GPT_IMAGE_2_5,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      defaultQuality: 'max',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 16,
      qualityOptions: GPT_IMAGE_2_5_QUALITY_OPTIONS,
    },

    [MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_SUNBURST]: {
      aspectRatios: ASPECT_RATIOS.GPT_IMAGE_2_5,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      defaultQuality: 'max',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 16,
      qualityOptions: GPT_IMAGE_2_5_QUALITY_OPTIONS,
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

    [MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5]: {
      aspectRatios: ASPECT_RATIOS.RUNWAY_GEN4,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
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
    [MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER]: {
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
      hasResolutionOptions: true,
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
      hasResolutionOptions: true,
      hasSpeech: true,
      hasVideoReferences: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 7,
      maxVideoReferences: 1,
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

    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO_EDIT,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [3, 5, 10],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 4,
    },

    [MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6]: {
      aspectRatios: ASPECT_RATIOS.PIXVERSE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 8, 10, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.GROK_IMAGE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },

    // MiniMax H3 / Hailuo
    [MODEL_KEYS.REPLICATE_MINIMAX_H3]: {
      aspectRatios: ASPECT_RATIOS.SEEDANCE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      hasVideoReferences: true,
      isBatchSupported: false,
      maxOutputs: 1,
      // One first frame plus up to nine reference images.
      maxReferences: 10,
      maxVideoReferences: 3,
    },
    [MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3]: {
      aspectRatios: ASPECT_RATIOS.HAILUO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 6,
      durations: [6, 10],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST]: {
      aspectRatios: ASPECT_RATIOS.HAILUO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 6,
      durations: [6, 10],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      requiresFirstFrame: true,
    },

    // Vidu
    [MODEL_KEYS.REPLICATE_VIDU_Q3_PRO]: {
      aspectRatios: ASPECT_RATIOS.VIDU,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
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
    [MODEL_KEYS.REPLICATE_VIDU_Q3_TURBO]: {
      aspectRatios: ASPECT_RATIOS.VIDU,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
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

    // WAN Video 2.7
    [MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V]: {
      aspectRatios: ASPECT_RATIOS.WAN_27,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 0,
    },

    [MODEL_KEYS.REPLICATE_META_MUSICGEN]: {
      category: ModelCategory.MUSIC,
      defaultDuration: 10,
      durations: [5, 10, 15, 30],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      supportsInstrumental: true,
      supportsLyrics: false,
      supportsVocals: false,
    },

    // fal.ai: https://fal.ai/learn/devs/elevenlabs-music-user-guide — 3s-10min
    // range; our own CreateMusicDto caps duration at 90s so the offered steps
    // stay inside both bounds.
    [MODEL_KEYS.FAL_ELEVENLABS_MUSIC]: {
      category: ModelCategory.MUSIC,
      defaultDuration: 30,
      durations: [10, 15, 20, 30, 45, 60, 90],
      hasDurationEditing: true,
      isBatchSupported: false,
      languages: ['en'],
      maxOutputs: 4,
      maxReferences: 0,
      supportsInstrumental: true,
      supportsLyrics: true,
      supportsVocals: true,
    },

    // fal.ai: https://fal.ai/learn/tools/best-text-to-music-apis-2026 — up to
    // 3-minute full songs with vocals/lyrics and multi-language support.
    [MODEL_KEYS.FAL_LYRIA3_PRO]: {
      category: ModelCategory.MUSIC,
      defaultDuration: 30,
      durations: [10, 15, 20, 30, 45, 60, 90],
      hasDurationEditing: true,
      isBatchSupported: false,
      languages: ['en', 'es', 'fr', 'de', 'ja', 'ko', 'pt'],
      maxOutputs: 4,
      maxReferences: 0,
      supportsInstrumental: true,
      supportsLyrics: true,
      supportsVocals: true,
    },

    // Mureka platform docs: https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
    // Direct integration (not fal/Replicate) — lyrics-first song generation.
    [MODEL_KEYS.MUREKA_V9]: {
      category: ModelCategory.MUSIC,
      defaultDuration: 30,
      durations: [10, 15, 20, 30, 45, 60, 90],
      hasDurationEditing: true,
      isBatchSupported: false,
      languages: ['en', 'zh'],
      maxOutputs: 4,
      maxReferences: 0,
      supportsInstrumental: true,
      supportsLyrics: true,
      supportsVocals: true,
    },

    [MODEL_KEYS.ARGIL_ATOM]: {
      aspectRatios: ASPECT_RATIOS.ARGIL,
      category: ModelCategory.VOICE,
      defaultAspectRatio: '9:16',
      defaultDuration: 10,
      durations: [5, 10, 15, 30],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
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
    [MODEL_KEYS.HIGGSFIELD_KLING_VIDEO]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '9:16',
      defaultDuration: 5,
      durations: [5],
      hasDurationEditing: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.HIGGSFIELD_SOUL]: {
      aspectRatios: ASPECT_RATIOS.KLING,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '9:16',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 0,
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
    // Live, and deliberately not in the agent chat picker. Wired as
    // `LLM_DEFAULTS.grokFast` for TwitterPipelineService.draft. Do not retire
    // it onto the frontier Grok row (that is how grok-4-fast became a 10x bill).
    [MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST]: {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },

    [MODEL_KEYS.REPLICATE_NATERAW_BGE_LARGE_EN_V1_5]: {
      category: ModelCategory.EMBEDDING,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    },

    // fal.ai models
    [MODEL_KEYS.FAL_NANO_BANANA_2]: {
      aspectRatios: ASPECT_RATIOS.NANO_BANANA_2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 14,
    },
    [MODEL_KEYS.FAL_FLUX_2_PRO]: {
      aspectRatios: ASPECT_RATIOS.FLUX_V2,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 8,
    },
    [MODEL_KEYS.FAL_RECRAFT_V4_PRO]: {
      aspectRatios: ASPECT_RATIOS.RECRAFT,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_GPT_IMAGE_2]: {
      aspectRatios: ASPECT_RATIOS.GPT_IMAGE,
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      defaultQuality: 'high',
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 10,
      qualityOptions: GPT_IMAGE_QUALITY_OPTIONS,
    },
    [MODEL_KEYS.FAL_KLING_VIDEO_V3_PRO]: {
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
    [MODEL_KEYS.FAL_VEO_3_1]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [4, 6, 8],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
    [MODEL_KEYS.FAL_PIXVERSE_V6]: {
      aspectRatios: ASPECT_RATIOS.PIXVERSE,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 8, 10, 15],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    },
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
      hasInterpolation: true,
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
    [MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH]: {
      aspectRatios: ASPECT_RATIOS.VEO,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 8,
      durations: [3, 4, 5, 6, 7, 8, 9, 10],
      hasDurationEditing: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 3,
    },
    [MODEL_KEYS.FAL_MINIMAX_H3_MAX]: {
      aspectRatios: ASPECT_RATIOS.H3_MAX,
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
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
