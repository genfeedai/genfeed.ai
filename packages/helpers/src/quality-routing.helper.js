"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_QUALITY_MODELS = exports.MUSIC_QUALITY_MODELS = exports.VIDEO_QUALITY_MODELS = exports.IMAGE_QUALITY_MODELS = exports.DEFAULT_QUALITY_TIER = exports.QUALITY_TIER_OPTIONS = void 0;
exports.resolveQualityToModel = resolveQualityToModel;
exports.getQualityTierForModel = getQualityTierForModel;
exports.getQualityTierLabel = getQualityTierLabel;
exports.isQualityTierSupportedForCategory = isQualityTierSupportedForCategory;
exports.resolveQualityToModelFromDb = resolveQualityToModelFromDb;
exports.getQualityTierFromModel = getQualityTierFromModel;
const constants_1 = require("@genfeedai/constants");
const enums_1 = require("@genfeedai/enums");
const aspect_ratio_helper_1 = require("./aspect-ratio.helper");
const model_capability_helper_1 = require("./model-capability.helper");
exports.QUALITY_TIER_OPTIONS = [
    {
        description: 'Fast & affordable',
        label: 'Standard',
        value: enums_1.QualityTier.STANDARD,
    },
    {
        description: 'Best balance',
        label: 'Premium',
        value: enums_1.QualityTier.HIGH,
    },
    {
        description: 'Maximum quality',
        label: 'Ultra',
        value: enums_1.QualityTier.ULTRA,
    },
];
exports.DEFAULT_QUALITY_TIER = enums_1.QualityTier.HIGH;
exports.IMAGE_QUALITY_MODELS = {
    [enums_1.QualityTier.BASIC]: [
        enums_1.ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_3_FAST,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_4_FAST,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
    ],
    [enums_1.QualityTier.STANDARD]: [
        enums_1.ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_3_FAST,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_4_FAST,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
    ],
    [enums_1.QualityTier.HIGH]: [
        enums_1.ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
        enums_1.ModelKey.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
    ],
    [enums_1.QualityTier.ULTRA]: [
        enums_1.ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
        enums_1.ModelKey.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
        enums_1.ModelKey.REPLICATE_OPENAI_GPT_IMAGE_1_5,
        enums_1.ModelKey.REPLICATE_GOOGLE_NANO_BANANA_PRO,
        enums_1.ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
    ],
};
exports.VIDEO_QUALITY_MODELS = {
    [enums_1.QualityTier.BASIC]: [
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3_FAST,
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST,
        enums_1.ModelKey.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
        enums_1.ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
    ],
    [enums_1.QualityTier.STANDARD]: [
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3_FAST,
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST,
        enums_1.ModelKey.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
        enums_1.ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
    ],
    [enums_1.QualityTier.HIGH]: [
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3,
        enums_1.ModelKey.REPLICATE_KWAIVGI_KLING_V2_1,
        enums_1.ModelKey.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
        enums_1.ModelKey.REPLICATE_OPENAI_SORA_2,
    ],
    [enums_1.QualityTier.ULTRA]: [
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        enums_1.ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
        enums_1.ModelKey.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
        enums_1.ModelKey.REPLICATE_GOOGLE_VEO_2,
    ],
};
exports.MUSIC_QUALITY_MODELS = {
    [enums_1.QualityTier.BASIC]: [enums_1.ModelKey.REPLICATE_META_MUSICGEN],
    [enums_1.QualityTier.STANDARD]: [enums_1.ModelKey.REPLICATE_META_MUSICGEN],
    [enums_1.QualityTier.HIGH]: [enums_1.ModelKey.REPLICATE_META_MUSICGEN],
    [enums_1.QualityTier.ULTRA]: [enums_1.ModelKey.REPLICATE_META_MUSICGEN],
};
exports.CATEGORY_QUALITY_MODELS = {
    [enums_1.ModelCategory.IMAGE]: exports.IMAGE_QUALITY_MODELS,
    [enums_1.ModelCategory.VIDEO]: exports.VIDEO_QUALITY_MODELS,
    [enums_1.ModelCategory.MUSIC]: exports.MUSIC_QUALITY_MODELS,
};
function getQualityModelsForCategory(category) {
    return exports.CATEGORY_QUALITY_MODELS[category] ?? null;
}
const FORMAT_TO_ASPECT_RATIO = {
    landscape: '16:9',
    portrait: '9:16',
    square: '1:1',
};
function formatToAspectRatio(format) {
    return FORMAT_TO_ASPECT_RATIO[format] ?? '16:9';
}
function isModelFormatCompatible(modelKey, format) {
    return (0, aspect_ratio_helper_1.isAspectRatioSupported)(modelKey, formatToAspectRatio(format));
}
function resolveQualityToModel(quality, category, format, availableModelKeys) {
    const qualityModels = getQualityModelsForCategory(category);
    if (!qualityModels) {
        return null;
    }
    const tierModels = qualityModels[quality];
    const availableSet = new Set(availableModelKeys);
    for (const modelKey of tierModels) {
        if (availableSet.has(modelKey) &&
            isModelFormatCompatible(modelKey, format)) {
            return modelKey;
        }
    }
    const tierOrder = [
        enums_1.QualityTier.ULTRA,
        enums_1.QualityTier.HIGH,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.BASIC,
    ];
    const currentTierIndex = tierOrder.indexOf(quality);
    for (let i = currentTierIndex + 1; i < tierOrder.length; i++) {
        const fallbackTier = tierOrder[i];
        const fallbackModels = qualityModels[fallbackTier];
        for (const modelKey of fallbackModels) {
            if (availableSet.has(modelKey) &&
                isModelFormatCompatible(modelKey, format)) {
                return modelKey;
            }
        }
    }
    const categoryAvailableModels = availableModelKeys.filter((key) => {
        const capability = constants_1.MODEL_OUTPUT_CAPABILITIES[key];
        return (capability?.category === category &&
            isModelFormatCompatible(key, format));
    });
    return categoryAvailableModels.length > 0
        ? categoryAvailableModels[0]
        : null;
}
function getQualityTierForModel(modelKey, category) {
    const qualityModels = getQualityModelsForCategory(category);
    if (!qualityModels) {
        return exports.DEFAULT_QUALITY_TIER;
    }
    const tiers = [
        enums_1.QualityTier.ULTRA,
        enums_1.QualityTier.HIGH,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.BASIC,
    ];
    for (const tier of tiers) {
        if (qualityModels[tier].includes(modelKey)) {
            return tier;
        }
    }
    return exports.DEFAULT_QUALITY_TIER;
}
function getQualityTierLabel(quality) {
    const option = exports.QUALITY_TIER_OPTIONS.find((o) => o.value === quality);
    return option?.label ?? 'Premium';
}
const QUALITY_TIER_SUPPORTED_CATEGORIES = new Set([
    enums_1.ModelCategory.IMAGE,
    enums_1.ModelCategory.VIDEO,
    enums_1.ModelCategory.MUSIC,
]);
function isQualityTierSupportedForCategory(category) {
    return QUALITY_TIER_SUPPORTED_CATEGORIES.has(category);
}
// ============================================================================
// DB-backed quality resolution
// ============================================================================
function isModelFormatCompatibleFromDoc(model, format) {
    const cap = (0, model_capability_helper_1.getModelCapability)(model);
    return (0, aspect_ratio_helper_1.isAspectRatioSupported)(model.key, formatToAspectRatio(format), cap);
}
/**
 * Resolve quality tier to a model using model documents from the database.
 * Models are filtered by category, quality tier, format compatibility, and active status.
 * Falls back to lower tiers if the requested tier has no compatible models.
 */
function resolveQualityToModelFromDb(quality, category, format, models) {
    const activeModels = models.filter((m) => m.category === category && m.isActive && !m.isDeleted);
    const tierMatch = activeModels.find((m) => m.qualityTier === quality && isModelFormatCompatibleFromDoc(m, format));
    if (tierMatch) {
        return tierMatch;
    }
    const tierOrder = [
        enums_1.QualityTier.ULTRA,
        enums_1.QualityTier.HIGH,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.BASIC,
    ];
    const currentIndex = tierOrder.indexOf(quality);
    for (let i = currentIndex + 1; i < tierOrder.length; i++) {
        const fallbackTier = tierOrder[i];
        const fallbackMatch = activeModels.find((m) => m.qualityTier === fallbackTier &&
            isModelFormatCompatibleFromDoc(m, format));
        if (fallbackMatch) {
            return fallbackMatch;
        }
    }
    const anyMatch = activeModels.find((m) => isModelFormatCompatibleFromDoc(m, format));
    return anyMatch ?? null;
}
/**
 * Get the quality tier for a model from its DB document.
 * Falls back to DEFAULT_QUALITY_TIER if not set.
 */
function getQualityTierFromModel(model) {
    return model.qualityTier ?? exports.DEFAULT_QUALITY_TIER;
}
//# sourceMappingURL=quality-routing.helper.js.map