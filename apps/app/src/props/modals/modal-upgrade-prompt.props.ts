import type { QualityTier } from '@genfeedai/contracts';

/**
 * `plan`: a feature or quality tier needs a higher plan.
 * `credits`: the organization has no credits left for a credit-spending action.
 */
export type UpgradePromptReason = 'plan' | 'credits';

export interface ModalUpgradePromptProps {
  /** Persisted tier string; unknown or legacy values resolve to FREE. */
  currentTier?: string | null;
  lockedQualityTier?: QualityTier;
  reason?: UpgradePromptReason;
}
