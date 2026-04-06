import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  type IngredientFormat,
  ModelCategory,
  QualityTier,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';

import { isAspectRatioSupported } from './aspect-ratio.helper';
import { getModelCapability } from './model-capability.helper';

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

export const IMAGE_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
  ],
  [QualityTier.STANDARD]: [
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
  ],
  [QualityTier.HIGH]: [
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
  ],
  [QualityTier.ULTRA]: [
    MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
    MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
    MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
  ],
};

export const VIDEO_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
    MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
  ],
  [QualityTier.STANDARD]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
    MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
  ],
  [QualityTier.HIGH]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
    MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
  ],
  [QualityTier.ULTRA]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
    MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
  ],
};

export const MUSIC_QUALITY_MODELS: Record<QualityTier, string[]> = {
  [QualityTier.BASIC]: [MODEL_KEYS.REPLICATE_META_MUSICGEN],
  [QualityTier.STANDARD]: [MODEL_KEYS.REPLICATE_META_MUSICGEN],
  [QualityTier.HIGH]: [MODEL_KEYS.REPLICATE_META_MUSICGEN],
  [QualityTier.ULTRA]: [MODEL_KEYS.REPLICATE_META_MUSICGEN],
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

const FORMAT_TO_ASPECT_RATIO: Record<string, string> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
};

function formatToAspectRatio(format: IngredientFormat | string): string {
  return FORMAT_TO_ASPECT_RATIO[format] ?? '16:9';
}

function isModelFormatCompatible(
  modelKey: string,
  format: IngredientFormat | string,
): boolean {
  return isAspectRatioSupported(modelKey, formatToAspectRatio(format));
}

export function resolveQualityToModel(
  quality: QualityTier,
  category: ModelCategory,
  format: IngredientFormat | string,
  availableModelKeys: string[],
): string | null {
  const qualityModels = getQualityModelsForCategory(category);

  if (!qualityModels) {
    return null;
  }

  const tierModels = qualityModels[quality];
  const availableSet = new Set(availableModelKeys);

  for (const modelKey of tierModels) {
    if (
      availableSet.has(modelKey) &&
      isModelFormatCompatible(modelKey, format)
    ) {
      return modelKey;
    }
  }

  const tierOrder: QualityTier[] = [
    QualityTier.ULTRA,
    QualityTier.HIGH,
    QualityTier.STANDARD,
    QualityTier.BASIC,
  ];
  const currentTierIndex = tierOrder.indexOf(quality);

  for (let i = currentTierIndex + 1; i < tierOrder.length; i++) {
    const fallbackTier = tierOrder[i];
    const fallbackModels = qualityModels[fallbackTier];

    for (const modelKey of fallbackModels) {
      if (
        availableSet.has(modelKey) &&
        isModelFormatCompatible(modelKey, format)
      ) {
        return modelKey;
      }
    }
  }

  const categoryAvailableModels = availableModelKeys.filter((key) => {
    const capability = MODEL_OUTPUT_CAPABILITIES[key as string];
    return (
      capability?.category === category &&
      isModelFormatCompatible(key as string, format)
    );
  });

  return categoryAvailableModels.length > 0
    ? (categoryAvailableModels[0] as string)
    : null;
}

export function getQualityTierForModel(
  modelKey: string,
  category: ModelCategory,
): QualityTier {
  const qualityModels = getQualityModelsForCategory(category);

  if (!qualityModels) {
    return DEFAULT_QUALITY_TIER;
  }

  const tiers: QualityTier[] = [
    QualityTier.ULTRA,
    QualityTier.HIGH,
    QualityTier.STANDARD,
    QualityTier.BASIC,
  ];

  for (const tier of tiers) {
    if (qualityModels[tier].includes(modelKey as string)) {
      return tier;
    }
  }

  return DEFAULT_QUALITY_TIER;
}

export function getQualityTierLabel(quality: QualityTier): string {
  const option = QUALITY_TIER_OPTIONS.find((o) => o.value === quality);
  return option?.label ?? 'Premium';
}

const QUALITY_TIER_SUPPORTED_CATEGORIES = new Set([
  ModelCategory.IMAGE,
  ModelCategory.VIDEO,
  ModelCategory.MUSIC,
]);

export function isQualityTierSupportedForCategory(
  category: ModelCategory,
): boolean {
  return QUALITY_TIER_SUPPORTED_CATEGORIES.has(category);
}

// ============================================================================
// DB-backed quality resolution
// ============================================================================

function isModelFormatCompatibleFromDoc(
  model: IModel,
  format: IngredientFormat | string,
): boolean {
  const cap = getModelCapability(model);
  return isAspectRatioSupported(model.key, formatToAspectRatio(format), cap);
}

/**
 * Resolve quality tier to a model using model documents from the database.
 * Models are filtered by category, quality tier, format compatibility, and active status.
 * Falls back to lower tiers if the requested tier has no compatible models.
 */
export function resolveQualityToModelFromDb(
  quality: QualityTier,
  category: ModelCategory,
  format: IngredientFormat | string,
  models: IModel[],
): IModel | null {
  const activeModels = models.filter(
    (m) => m.category === category && m.isActive && !m.isDeleted,
  );

  const tierMatch = activeModels.find(
    (m) =>
      m.qualityTier === quality && isModelFormatCompatibleFromDoc(m, format),
  );
  if (tierMatch) {
    return tierMatch;
  }

  const tierOrder: QualityTier[] = [
    QualityTier.ULTRA,
    QualityTier.HIGH,
    QualityTier.STANDARD,
    QualityTier.BASIC,
  ];
  const currentIndex = tierOrder.indexOf(quality);

  for (let i = currentIndex + 1; i < tierOrder.length; i++) {
    const fallbackTier = tierOrder[i];
    const fallbackMatch = activeModels.find(
      (m) =>
        m.qualityTier === fallbackTier &&
        isModelFormatCompatibleFromDoc(m, format),
    );
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }

  const anyMatch = activeModels.find((m) =>
    isModelFormatCompatibleFromDoc(m, format),
  );
  return anyMatch ?? null;
}

/**
 * Get the quality tier for a model from its DB document.
 * Falls back to DEFAULT_QUALITY_TIER if not set.
 */
export function getQualityTierFromModel(model: IModel): QualityTier {
  return model.qualityTier ?? DEFAULT_QUALITY_TIER;
}
