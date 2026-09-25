/**
 * Why an organization's agent chat model is pinned. `free_tier`: a hosted
 * organization without an active paid subscription (and no BYOK key) runs
 * every agent turn on the platform default model.
 */
export type AgentModelLockReason = 'free_tier';

/** Agent chat model entitlement for the current organization. */
export interface IAgentModelAccess {
  isLocked: boolean;
  /** Registry key every turn runs on while locked; null when unlocked. */
  lockedModelKey: string | null;
  lockedModelLabel: string | null;
  reason: AgentModelLockReason | null;
}

/** GET /agent/credits response. */
export interface IAgentCreditsInfo {
  /** Exact balance (full precision); format with `formatCreditBalance`. */
  balance: number;
  modelAccess: IAgentModelAccess;
  /**
   * Estimated credits for an average message per selectable model key
   * (fractional; format with `formatCreditCostEstimate`).
   */
  modelCosts: Record<string, number>;
}
