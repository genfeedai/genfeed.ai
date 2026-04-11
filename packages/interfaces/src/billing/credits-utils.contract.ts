/**
 * Contract for the credits utility service.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87 and
 * `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b).
 *
 * This contract describes the methods OSS core-loop code calls on the credits
 * utility layer. It is consumed by:
 * - `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts`
 * - `apps/server/api/src/collections/trends/controllers/trends.controller.ts`
 * - `apps/server/api/src/collections/templates/controllers/templates.controller.ts`
 *
 * The concrete implementation currently lives at
 * `apps/server/api/src/collections/credits/services/credits.utils.service.ts`
 * and will be moved to `ee/packages/billing/` in a follow-up PR (Phase C Layer 2).
 *
 * When `isEEEnabled() === false`, OSS ships a no-op implementation that treats
 * self-hosted deployments as having unlimited credits.
 */
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
}
