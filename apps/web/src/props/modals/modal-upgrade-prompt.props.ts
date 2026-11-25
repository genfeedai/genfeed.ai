import type { QualityTier } from '@genfeedai/contracts';

/**
 * `plan`: a feature or quality tier needs a higher plan.
 * `credits`: the organization has no credits left for a credit-spending action.
 * `x-posting`: posting to X was refused because the organization is on the free
 * plan or cannot pay the credits the post costs.
 */
type UpgradePromptReason = 'plan' | 'credits' | 'x-posting';

export interface ModalUpgradePromptProps {
  /** Persisted tier string; unknown or legacy values resolve to FREE. */
  currentTier?: string | null;
  lockedQualityTier?: QualityTier;
  reason?: UpgradePromptReason;
}
