"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_QUALITY_ACCESS = void 0;
exports.getQualityTiersForSubscription = getQualityTiersForSubscription;
exports.hasQualityAccess = hasQualityAccess;
const enums_1 = require("@genfeedai/enums");
/**
 * Maps subscription tiers to their allowed quality tiers.
 * Higher tiers get access to more quality options.
 */
exports.TIER_QUALITY_ACCESS = {
    [enums_1.SubscriptionTier.FREE]: [enums_1.QualityTier.BASIC],
    [enums_1.SubscriptionTier.BYOK]: [enums_1.QualityTier.BASIC],
    [enums_1.SubscriptionTier.CREATOR]: [enums_1.QualityTier.BASIC, enums_1.QualityTier.STANDARD],
    [enums_1.SubscriptionTier.PRO]: [
        enums_1.QualityTier.BASIC,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.HIGH,
    ],
    [enums_1.SubscriptionTier.SCALE]: [
        enums_1.QualityTier.BASIC,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.HIGH,
        enums_1.QualityTier.ULTRA,
    ],
    [enums_1.SubscriptionTier.ENTERPRISE]: [
        enums_1.QualityTier.BASIC,
        enums_1.QualityTier.STANDARD,
        enums_1.QualityTier.HIGH,
        enums_1.QualityTier.ULTRA,
    ],
};
/**
 * Get all allowed quality tiers for a subscription tier.
 * Returns BASIC only for unknown tiers.
 */
function getQualityTiersForSubscription(tier) {
    return exports.TIER_QUALITY_ACCESS[tier] ?? [enums_1.QualityTier.BASIC];
}
/**
 * Check if a subscription tier has access to a specific quality tier.
 */
function hasQualityAccess(subscriptionTier, qualityTier) {
    const allowed = exports.TIER_QUALITY_ACCESS[subscriptionTier];
    return allowed ? allowed.includes(qualityTier) : false;
}
//# sourceMappingURL=tier-models.helper.js.map