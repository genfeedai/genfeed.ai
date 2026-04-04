"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultAspectRatio = getDefaultAspectRatio;
exports.getAspectRatiosForModel = getAspectRatiosForModel;
exports.normalizeAspectRatioForModel = normalizeAspectRatioForModel;
exports.calculateAspectRatio = calculateAspectRatio;
exports.isAspectRatioSupported = isAspectRatioSupported;
exports.convertRatioToOrientation = convertRatioToOrientation;
exports.getDefaultAspectRatioFromModel = getDefaultAspectRatioFromModel;
exports.getAspectRatiosFromModel = getAspectRatiosFromModel;
exports.normalizeAspectRatioFromModel = normalizeAspectRatioFromModel;
exports.isAspectRatioSupportedFromModel = isAspectRatioSupportedFromModel;
const constants_1 = require("@genfeedai/constants");
const enums_1 = require("@genfeedai/enums");
const model_capability_helper_1 = require("./model-capability.helper");
const CATEGORIES_WITHOUT_ASPECT_RATIO = new Set([
    enums_1.ModelCategory.TEXT,
    enums_1.ModelCategory.EMBEDDING,
    enums_1.ModelCategory.MUSIC,
    enums_1.ModelCategory.IMAGE_UPSCALE,
    enums_1.ModelCategory.VIDEO_UPSCALE,
]);
const DEFAULT_ASPECT_RATIO_BY_CATEGORY = {
    [enums_1.ModelCategory.VIDEO]: '16:9',
    [enums_1.ModelCategory.VIDEO_EDIT]: '16:9',
    [enums_1.ModelCategory.VOICE]: '16:9',
    [enums_1.ModelCategory.IMAGE]: '1:1',
    [enums_1.ModelCategory.IMAGE_EDIT]: '1:1',
};
function getModelAspectRatioConfig(modelKey, capability) {
    const cap = capability ?? constants_1.MODEL_OUTPUT_CAPABILITIES[modelKey];
    if (!cap) {
        return { available: ['1:1', '9:16', '16:9'], default: '16:9' };
    }
    if (CATEGORIES_WITHOUT_ASPECT_RATIO.has(cap.category)) {
        return { available: [], default: '16:9' };
    }
    const defaultRatio = DEFAULT_ASPECT_RATIO_BY_CATEGORY[cap.category] ?? '16:9';
    if (cap.category === enums_1.ModelCategory.VIDEO) {
        return {
            available: cap.aspectRatios ?? [],
            default: cap.defaultAspectRatio ?? defaultRatio,
            usesOrientation: cap.usesOrientation,
        };
    }
    return {
        available: cap.aspectRatios ?? [],
        default: cap.defaultAspectRatio ??
            defaultRatio,
    };
}
function getDefaultAspectRatio(modelKey, capability) {
    return getModelAspectRatioConfig(modelKey, capability).default;
}
function getAspectRatiosForModel(modelKey, capability) {
    return getModelAspectRatioConfig(modelKey, capability).available;
}
function normalizeAspectRatioForModel(modelKey, aspectRatio, capability) {
    const config = getModelAspectRatioConfig(modelKey, capability);
    if (config.available.includes(aspectRatio)) {
        return aspectRatio;
    }
    if (config.usesOrientation) {
        return convertRatioToOrientation(aspectRatio);
    }
    return config.default;
}
const ASPECT_RATIO_MAP = [
    { label: '16:9', ratio: 16 / 9 },
    { label: '21:9', ratio: 21 / 9 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '3:2', ratio: 3 / 2 },
    { label: '5:4', ratio: 5 / 4 },
    { label: '2:1', ratio: 2 / 1 },
    { label: '9:16', ratio: 9 / 16 },
    { label: '3:4', ratio: 3 / 4 },
    { label: '2:3', ratio: 2 / 3 },
    { label: '4:5', ratio: 4 / 5 },
    { label: '1:2', ratio: 1 / 2 },
    { label: '1:1', ratio: 1 },
];
const TOLERANCE = 0.1;
function calculateAspectRatio(width, height) {
    if (!width || !height) {
        return '16:9';
    }
    const gcd = calculateGCD(width, height);
    const ratio = width / gcd / (height / gcd);
    for (const { ratio: targetRatio, label } of ASPECT_RATIO_MAP) {
        if (Math.abs(ratio - targetRatio) < TOLERANCE) {
            return label;
        }
    }
    return width > height ? '16:9' : '9:16';
}
function calculateGCD(a, b) {
    return b === 0 ? a : calculateGCD(b, a % b);
}
function isAspectRatioSupported(modelKey, aspectRatio, capability) {
    return getModelAspectRatioConfig(modelKey, capability).available.includes(aspectRatio);
}
const PORTRAIT_RATIOS = new Set(['9:16', '3:4', '2:3', '1:2']);
function convertRatioToOrientation(ratio) {
    if (PORTRAIT_RATIOS.has(ratio)) {
        return 'portrait';
    }
    return 'landscape';
}
// ============================================================================
// IModel-based overloads
// ============================================================================
/** Get default aspect ratio from an IModel document (DB-backed with constant fallback). */
function getDefaultAspectRatioFromModel(model) {
    return getDefaultAspectRatio(model.key, (0, model_capability_helper_1.getModelCapability)(model));
}
/** Get available aspect ratios from an IModel document. */
function getAspectRatiosFromModel(model) {
    return getAspectRatiosForModel(model.key, (0, model_capability_helper_1.getModelCapability)(model));
}
/** Normalize an aspect ratio for an IModel document. */
function normalizeAspectRatioFromModel(model, aspectRatio) {
    return normalizeAspectRatioForModel(model.key, aspectRatio, (0, model_capability_helper_1.getModelCapability)(model));
}
/** Check if an aspect ratio is supported by an IModel document. */
function isAspectRatioSupportedFromModel(model, aspectRatio) {
    return isAspectRatioSupported(model.key, aspectRatio, (0, model_capability_helper_1.getModelCapability)(model));
}
//# sourceMappingURL=aspect-ratio.helper.js.map