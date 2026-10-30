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
 * legacy values) to a known tier. Matching is exact, like the server's plan
 * entitlement lookup, so a value the server treats as FREE shows as FREE here.
 */
export function resolveSubscriptionTier(
  value: string | null | undefined,
): SubscriptionTier {
  return (
    Object.values(SubscriptionTier).find((tier) => tier === value) ??
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
