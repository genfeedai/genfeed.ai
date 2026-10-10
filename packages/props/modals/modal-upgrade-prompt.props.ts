import type { QualityTier, SubscriptionTier } from '@genfeedai/contracts';

/**
 * `plan`: a feature or quality tier needs a higher plan.
 * `credits`: the organization has no credits left for a credit-spending action.
 */
export type UpgradePromptReason = 'plan' | 'credits';

export interface ModalUpgradePromptProps {
  currentTier?: SubscriptionTier;
  lockedQualityTier?: QualityTier;
  reason?: UpgradePromptReason;
}
