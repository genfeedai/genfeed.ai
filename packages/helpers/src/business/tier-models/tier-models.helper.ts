import { QualityTier, SubscriptionTier } from '@genfeedai/contracts';

/**
 * Maps subscription tiers to their allowed quality tiers.
 * Higher tiers get access to more quality options.
 */
export const TIER_QUALITY_ACCESS: Record<SubscriptionTier, QualityTier[]> = {
  [SubscriptionTier.FREE]: [QualityTier.BASIC],
  [SubscriptionTier.SCALE]: [
    QualityTier.BASIC,
    QualityTier.STANDARD,
    QualityTier.HIGH,
    QualityTier.ULTRA,
  ],
  [SubscriptionTier.ENTERPRISE]: [
    QualityTier.BASIC,
    QualityTier.STANDARD,
    QualityTier.HIGH,
    QualityTier.ULTRA,
  ],
};

/**
 * Resolve a persisted `subscriptionTier` (a free-text column that can hold
 * legacy or differently cased values) to a known tier. Unknown values fall
 * back to FREE.
 */
export function resolveSubscriptionTier(
  value: string | null | undefined,
): SubscriptionTier {
  const normalized = value?.trim().toLowerCase();

  return (
    Object.values(SubscriptionTier).find((tier) => tier === normalized) ??
    SubscriptionTier.FREE
  );
}

/**
 * Get all allowed quality tiers for a subscription tier.
 * Returns BASIC only for unknown tiers.
 */
export function getQualityTiersForSubscription(
  tier: SubscriptionTier,
): QualityTier[] {
  return TIER_QUALITY_ACCESS[tier] ?? [QualityTier.BASIC];
}

/**
 * Check if a subscription tier has access to a specific quality tier.
 */
export function hasQualityAccess(
  subscriptionTier: SubscriptionTier,
  qualityTier: QualityTier,
): boolean {
  const allowed = TIER_QUALITY_ACCESS[subscriptionTier];
  return allowed ? allowed.includes(qualityTier) : false;
}
