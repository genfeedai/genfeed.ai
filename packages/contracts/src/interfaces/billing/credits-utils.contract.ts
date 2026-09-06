import type { ActivitySource } from '../..';
import type {
  ICreditReservation,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from './billing-account.interface';
import type { ICreditWalletSnapshot } from './credits.interface';

/**
 * Contract for the credits utility service.
 *
 * This contract describes every method OSS code calls on the credits utility
 * layer. A repo-wide grep of `creditsUtilsService\.` across `apps/server/api/
 * src/` identifies 9 methods used by 40+ call sites spanning controllers,
 * services, guards, queue processors, and the agent orchestrator. All 9 are
 * included here so `implements ICreditsUtilsService` on the concrete class
 * gives real compiler enforcement instead of silently allowing drift.
 *
 * The concrete implementation lives at
 * `apps/server/api/src/collections/credits/services/credits.utils.service.ts`.
 *
 * When `usesMeteredCredits() === false` (community self-host / desktop — not
 * Cloud SaaS), OSS ships a no-op that treats the deployment as having unlimited
 * credits (BYOK free). Cloud SaaS uses the real ledger even without
 * `GENFEED_LICENSE_KEY`. The no-op's signatures must match this contract exactly.
 */

/**
 * Individual credit ledger entry returned by
 * {@link ICreditsUtilsService.getOrganizationCreditsWithExpiration}.
 */
export interface IOrganizationCreditEntry {
  balance: number;
  expiresAt?: Date;
  source?: string;
  createdAt?: Date;
}

/**
 * Structured snapshot of an organization's credit pool.
 * Returned by {@link ICreditsUtilsService.getOrganizationCreditsWithExpiration}.
 */
export interface IOrganizationCreditsWithExpiration {
  total: number;
  credits: IOrganizationCreditEntry[];
}

/**
 * Billing-cycle derived metrics.
 * Returned by {@link ICreditsUtilsService.getCycleRemainingMetrics}.
 */
export interface ICycleRemainingMetrics {
  cycleTotal: number;
  remainingPercent: number;
}

/**
 * Options for `deductCreditsFromOrganization`. Extracted to a named interface
 * so consumers can reuse it and so the contract stays aligned with the
 * "never define inline interfaces" coding guideline.
 */
export interface IDeductCreditsOptions {
  idempotencyKey?: string;
  maxOverdraftCredits?: number;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  referenceType?: string;
}

export interface IAddCreditsOptions {
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  referenceType?: string;
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
   *
   * `source` is typed as {@link ActivitySource} (from `@genfeedai/contracts`) to
   * match the concrete implementation, which forwards the value into activity
   * writes validated against the enum. Typing it as a free `string` would
   * compile at the interface boundary but fail at runtime when the activity
   * layer validates. Every implementation MUST preserve this constraint;
   * the OSS no-op simply ignores the value.
   *
   * OSS no-op is a no-op (resolves successfully).
   */
  deductCreditsFromOrganization(
    organizationId: string,
    userId: string,
    creditsToDeduct: number,
    description: string,
    source?: ActivitySource,
    options?: IDeductCreditsOptions,
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
    options?: IAddCreditsOptions,
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
    options?: IAddCreditsOptions,
  ): Promise<void>;

  /**
   * Reset the organization balance to a new absolute amount.
   * Used by billing cycle resets.
   *
   * `options.referenceId`/`referenceType` let callers persist a dedup
   * reference on the reset transaction row itself, symmetric to
   * {@link addOrganizationCreditsWithExpiration} — required so a resettable
   * (e.g. yearly) billing cycle grant can be idempotency-checked the same
   * way an additive (e.g. monthly) grant is (see #1398).
   *
   * OSS no-op is a no-op.
   */
  resetOrganizationCredits(
    organizationId: string,
    newCreditAmount: number,
    source: string,
    description: string,
    options?: IAddCreditsOptions,
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

  getWalletSnapshot(organizationId: string): Promise<ICreditWalletSnapshot>;

  reserveCredits(input: IReserveCreditsInput): Promise<ICreditReservation>;

  settleReservation(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot>;

  releaseReservation(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot>;
}
