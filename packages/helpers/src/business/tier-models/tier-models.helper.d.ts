import { QualityTier, SubscriptionTier } from '@genfeedai/enums';
/**
 * Maps subscription tiers to their allowed quality tiers.
 * Higher tiers get access to more quality options.
 */
export declare const TIER_QUALITY_ACCESS: Record<SubscriptionTier, QualityTier[]>;
/**
 * Get all allowed quality tiers for a subscription tier.
 * Returns BASIC only for unknown tiers.
 */
export declare function getQualityTiersForSubscription(tier: SubscriptionTier): QualityTier[];
/**
 * Check if a subscription tier has access to a specific quality tier.
 */
export declare function hasQualityAccess(subscriptionTier: SubscriptionTier, qualityTier: QualityTier): boolean;
//# sourceMappingURL=tier-models.helper.d.ts.map