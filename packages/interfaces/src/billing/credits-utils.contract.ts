/**
 * Contract for the credits utility service.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87 and
 * `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b).
 *
 * This contract describes every method OSS code calls on the credits utility
 * layer. A repo-wide grep of `creditsUtilsService\.` across `apps/server/api/
 * src/` identifies 9 methods used by 40+ call sites spanning controllers,
 * services, guards, queue processors, and the agent orchestrator. All 9 are
 * included here so `implements ICreditsUtilsService` on the concrete class
 * gives real compiler enforcement instead of silently allowing drift.
 *
 * The concrete implementation currently lives at
 * `apps/server/api/src/collections/credits/services/credits.utils.service.ts`
 * and will be moved to `ee/packages/billing/` in a follow-up PR (Phase C Layer 2).
 *
 * When `isEEEnabled() === false`, OSS ships a no-op implementation that treats
 * self-hosted deployments as having unlimited credits. The no-op's signatures
 * must match this contract exactly.
 */

/**
 * Structured snapshot of an organization's credit pool.
 * Returned by {@link ICreditsUtilsService.getOrganizationCreditsWithExpiration}.
 */
export interface IOrganizationCreditsWithExpiration {
  total: number;
  credits: Array<{
    balance: number;
    expiresAt?: Date;
    source?: string;
    createdAt?: Date;
  }>;
}

/**
 * Billing-cycle derived metrics.
 * Returned by {@link ICreditsUtilsService.getCycleRemainingMetrics}.
 */
export interface ICycleRemainingMetrics {
  cycleTotal: number;
  remainingPercent: number;
}

export interface ICreditsUtilsService {
  /**
   * Returns true if the organization has at least `requiredCredits` available.
   * OSS no-op returns `true` unconditionally.
   */
  checkOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<boolean>;

  /**
   * Returns the organization's current credit balance.
   * OSS no-op returns `Number.POSITIVE_INFINITY` or a configurable quota.
   */
  getOrganizationCreditsBalance(organizationId: string): Promise<number>;

  /**
   * Debit credits from an organization, recording an activity.
   * OSS no-op is a no-op (resolves successfully).
   */
  deductCreditsFromOrganization(
    organizationId: string,
    userId: string,
    creditsToDeduct: number,
    description: string,
    source?: string,
    options?: { maxOverdraftCredits?: number },
  ): Promise<void>;

  /**
   * Credit an organization with an expiring ledger entry.
   * OSS no-op is a no-op.
   */
  addOrganizationCreditsWithExpiration(
    organizationId: string,
    creditsToAdd: number,
    source: string,
    description: string,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Refund credits previously debited.
   * OSS no-op is a no-op.
   */
  refundOrganizationCredits(
    organizationId: string,
    creditsToRefund: number,
    source: string,
    description: string,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Reset the organization balance to a new absolute amount.
   * Used by billing cycle resets.
   * OSS no-op is a no-op.
   */
  resetOrganizationCredits(
    organizationId: string,
    newCreditAmount: number,
    source: string,
    description: string,
  ): Promise<void>;

  /**
   * Zero out all credits on an organization, typically on cancellation
   * or admin reset. Records the reason.
   * OSS no-op is a no-op.
   */
  removeAllOrganizationCredits(
    organizationId: string,
    source: string,
    description: string,
  ): Promise<void>;

  /**
   * Structured snapshot of current credits and ledger-level expiration data.
   * Called from signup-gift / credits-breakdown flows and the agent tool
   * executor (`apps/server/api/src/services/agent-orchestrator/tools/
   * agent-tool-executor.service.ts`).
   *
   * OSS no-op returns an "unlimited" snapshot:
   * `{ total: Number.POSITIVE_INFINITY, credits: [] }`.
   */
  getOrganizationCreditsWithExpiration(
    organizationId: string,
  ): Promise<IOrganizationCreditsWithExpiration>;

  /**
   * Billing-cycle metrics used by dashboards to show remaining credit vs.
   * cycle total.
   * OSS no-op returns `{ cycleTotal: 0, remainingPercent: 100 }`.
   */
  getCycleRemainingMetrics(
    organizationId: string,
    cycleStartAt: Date,
    cycleEndAt: Date,
    currentBalance: number,
  ): Promise<ICycleRemainingMetrics>;
}
