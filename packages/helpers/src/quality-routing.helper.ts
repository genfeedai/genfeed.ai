import { ModelCategory, QualityTier } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

export interface QualityTierOption {
  value: QualityTier;
  label: string;
  description: string;
}

export const QUALITY_TIER_OPTIONS: QualityTierOption[] = [
  {
    description: 'Fast & affordable',
    label: 'Standard',
    value: QualityTier.STANDARD,
  },
  {
    description: 'Best balance',
    label: 'Premium',
    value: QualityTier.HIGH,
  },
  {
    description: 'Maximum quality',
    label: 'Ultra',
    value: QualityTier.ULTRA,
  },
];

export const DEFAULT_QUALITY_TIER = QualityTier.HIGH;

const QUALITY_TIER_ORDER: QualityTier[] = [
  QualityTier.ULTRA,
  QualityTier.HIGH,
  QualityTier.STANDARD,
  QualityTier.BASIC,
];

export const IMAGE_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
  ],
  [QualityTier.STANDARD]: [
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
  ],
  [QualityTier.HIGH]: [
    MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_FLARE,
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_1,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
    MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
  ],
  [QualityTier.ULTRA]: [
    MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_SUNBURST,
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
  ],
};

export const VIDEO_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [
    MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
    MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
  ],
  [QualityTier.STANDARD]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
    MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
  ],
  [QualityTier.HIGH]: [
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    MODEL_KEYS.REPLICATE_MINIMAX_H3,
    MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
    MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
  ],
  [QualityTier.ULTRA]: [
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    MODEL_KEYS.FAL_MINIMAX_H3_MAX,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
    MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
  ],
};

export const MUSIC_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [MODEL_KEYS.FAL_LYRIA3_PRO],
  [QualityTier.STANDARD]: [MODEL_KEYS.MUREKA_V9, MODEL_KEYS.FAL_LYRIA3_PRO],
  [QualityTier.HIGH]: [MODEL_KEYS.FAL_LYRIA3_PRO, MODEL_KEYS.MUREKA_V9],
  [QualityTier.ULTRA]: [MODEL_KEYS.FAL_LYRIA3_PRO, MODEL_KEYS.MUREKA_V9],
};

export const CATEGORY_QUALITY_MODELS: Partial<
  Record<ModelCategory, Record<QualityTier, string[]>>
> = {
  [ModelCategory.IMAGE]: IMAGE_QUALITY_MODELS,
  [ModelCategory.VIDEO]: VIDEO_QUALITY_MODELS,
  [ModelCategory.MUSIC]: MUSIC_QUALITY_MODELS,
};

function getQualityModelsForCategory(
  category: ModelCategory,
): Record<QualityTier, string[]> | null {
  return CATEGORY_QUALITY_MODELS[category] ?? null;
}

export function getQualityTierForModel(
  modelKey: string,
  category: ModelCategory,
): QualityTier {
  const qualityModels = getQualityModelsForCategory(category);

  if (!qualityModels) {
    return DEFAULT_QUALITY_TIER;
  }

  for (const tier of QUALITY_TIER_ORDER) {
    for (const qualityModelKey of qualityModels[tier]) {
      if (qualityModelKey !== modelKey) {
        continue;
      }
      return tier;
    }
  }

  return DEFAULT_QUALITY_TIER;
}

export function getQualityTierLabel(quality: QualityTier): string {
  const option = QUALITY_TIER_OPTIONS.find((o) => o.value === quality);
  return option?.label ?? 'Premium';
}
