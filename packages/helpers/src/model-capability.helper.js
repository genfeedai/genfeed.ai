"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelCapabilityFromDoc = getModelCapabilityFromDoc;
exports.getModelCapability = getModelCapability;
exports.getModelCapabilityByKey = getModelCapabilityByKey;
const constants_1 = require("@genfeedai/constants");
const enums_1 = require("@genfeedai/enums");
const DEFAULT_MAX_OUTPUTS = 4;
const DEFAULT_MAX_REFERENCES = 1;
function buildBaseFields(model) {
    return {
        isBatchSupported: model.isBatchSupported ?? false,
        maxOutputs: model.maxOutputs ?? DEFAULT_MAX_OUTPUTS,
        maxReferences: model.maxReferences ?? DEFAULT_MAX_REFERENCES,
    };
}
function buildImageCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.IMAGE,
        ...(model.isReferencesMandatory != null && {
            isReferencesMandatory: model.isReferencesMandatory,
        }),
        ...(model.isImagenModel != null && {
            isImagenModel: model.isImagenModel,
        }),
        ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
        ...(model.defaultAspectRatio != null && {
            defaultAspectRatio: model.defaultAspectRatio,
        }),
    };
}
function buildVideoCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.VIDEO,
        ...(model.hasEndFrame != null && { hasEndFrame: model.hasEndFrame }),
        ...(model.hasInterpolation != null && {
            hasInterpolation: model.hasInterpolation,
        }),
        ...(model.hasSpeech != null && { hasSpeech: model.hasSpeech }),
        ...(model.hasAudioToggle != null && {
            hasAudioToggle: model.hasAudioToggle,
        }),
        ...(model.hasDurationEditing != null && {
            hasDurationEditing: model.hasDurationEditing,
        }),
        ...(model.hasResolutionOptions != null && {
            hasResolutionOptions: model.hasResolutionOptions,
        }),
        ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
        ...(model.defaultAspectRatio != null && {
            defaultAspectRatio: model.defaultAspectRatio,
        }),
        ...(model.usesOrientation != null && {
            usesOrientation: model.usesOrientation,
        }),
        ...(model.durations != null && { durations: model.durations }),
        ...(model.defaultDuration != null && {
            defaultDuration: model.defaultDuration,
        }),
    };
}
function buildImageEditCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.IMAGE_EDIT,
        ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
        ...(model.defaultAspectRatio != null && {
            defaultAspectRatio: model.defaultAspectRatio,
        }),
    };
}
function buildVideoEditCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.VIDEO_EDIT,
        ...(model.hasDurationEditing != null && {
            hasDurationEditing: model.hasDurationEditing,
        }),
        ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
        ...(model.defaultAspectRatio != null && {
            defaultAspectRatio: model.defaultAspectRatio,
        }),
        ...(model.durations != null && { durations: model.durations }),
        ...(model.defaultDuration != null && {
            defaultDuration: model.defaultDuration,
        }),
    };
}
function buildMusicCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.MUSIC,
        ...(model.hasDurationEditing != null && {
            hasDurationEditing: model.hasDurationEditing,
        }),
        ...(model.durations != null && { durations: model.durations }),
        ...(model.defaultDuration != null && {
            defaultDuration: model.defaultDuration,
        }),
    };
}
function buildVoiceCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.VOICE,
        ...(model.hasDurationEditing != null && {
            hasDurationEditing: model.hasDurationEditing,
        }),
        ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
        ...(model.defaultAspectRatio != null && {
            defaultAspectRatio: model.defaultAspectRatio,
        }),
        ...(model.durations != null && { durations: model.durations }),
        ...(model.defaultDuration != null && {
            defaultDuration: model.defaultDuration,
        }),
    };
}
function buildTextCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.TEXT,
    };
}
function buildEmbeddingCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.EMBEDDING,
    };
}
function buildImageUpscaleCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.IMAGE_UPSCALE,
    };
}
function buildVideoUpscaleCapability(model) {
    return {
        ...buildBaseFields(model),
        category: enums_1.ModelCategory.VIDEO_UPSCALE,
    };
}
const CATEGORY_BUILDERS = {
    [enums_1.ModelCategory.IMAGE]: buildImageCapability,
    [enums_1.ModelCategory.VIDEO]: buildVideoCapability,
    [enums_1.ModelCategory.IMAGE_EDIT]: buildImageEditCapability,
    [enums_1.ModelCategory.VIDEO_EDIT]: buildVideoEditCapability,
    [enums_1.ModelCategory.MUSIC]: buildMusicCapability,
    [enums_1.ModelCategory.VOICE]: buildVoiceCapability,
    [enums_1.ModelCategory.TEXT]: buildTextCapability,
    [enums_1.ModelCategory.EMBEDDING]: buildEmbeddingCapability,
    [enums_1.ModelCategory.IMAGE_UPSCALE]: buildImageUpscaleCapability,
    [enums_1.ModelCategory.VIDEO_UPSCALE]: buildVideoUpscaleCapability,
};
/**
 * Build a ModelOutputCapability from DB fields on the IModel document.
 * Returns null if the model has no capability fields populated (maxOutputs is undefined).
 */
function getModelCapabilityFromDoc(model) {
    if (model.maxOutputs == null) {
        return null;
    }
    const builder = CATEGORY_BUILDERS[model.category];
    if (!builder) {
        return null;
    }
    return builder(model);
}
/**
 * Get capability from DB fields first, falling back to the static constant.
 */
function getModelCapability(model) {
    return (getModelCapabilityFromDoc(model) ??
        constants_1.MODEL_OUTPUT_CAPABILITIES[model.key] ??
        null);
}
/**
 * Get capability by model key string. If an IModel document is provided,
 * uses DB fields with constant fallback. Otherwise looks up the static constant only.
 */
function getModelCapabilityByKey(modelKey, model) {
    if (model) {
        return getModelCapability(model);
    }
    return constants_1.MODEL_OUTPUT_CAPABILITIES[modelKey] ?? null;
}
//# sourceMappingURL=model-capability.helper.js.map