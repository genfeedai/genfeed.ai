import type {
  AgentSourceCandidate,
  AgentSourceIdentityKind,
  AgentSourceScope,
} from '@api/collections/agent-strategies/sources/agent-source-candidates';
import type { AgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';

export interface AgentSourceBinding extends AgentSourceScope {
  readonly strategyId: string;
  readonly executionId: string;
  readonly sourceKind: AgentSourceIdentityKind;
  readonly sourceId: string;
}
/** Exactly one canonical output family. References are supplied by trusted adapters. */
export type AgentSourceWork =
  | Readonly<{ remixRunId: string; clipResultIds?: never }>
  | Readonly<{ clipResultIds: readonly string[]; remixRunId?: never }>;
export interface AgentSourceQuoteReceipt {
  readonly quoteId: string;
  readonly revision: number;
  readonly inputHash: string;
  readonly totalCredits: number;
  readonly expiresAt: string;
}
export interface AgentSourceAuthorizationReceipt
  extends AgentSourceBinding,
    AgentSourceQuoteReceipt {
  readonly authorizationId: string;
}
export interface AgentSourceOwnershipToken extends AgentSourceBinding {
  readonly reservationId: string;
  readonly generation: number;
  readonly candidateSnapshotId: string;
  readonly work: AgentSourceWork;
}
export interface ReserveAgentSourceInput {
  readonly binding: AgentSourceBinding;
  readonly candidateSnapshotId: string;
  readonly candidates: readonly AgentSourceCandidate[];
  readonly selectedKey: string;
  readonly policy: AgentSourcePolicy;
  readonly quote: AgentSourceQuoteReceipt;
  readonly authorization: AgentSourceAuthorizationReceipt;
  readonly work: AgentSourceWork;
  /** Immutable pre-commitment amount; never a progressively reduced balance. */
  readonly remainingRunCredits: number;
  readonly budgetSnapshotId: string;
}
export interface ReserveAgentSourceCommand extends ReserveAgentSourceInput {
  readonly candidate: AgentSourceCandidate;
  readonly now: string;
}
export type AgentSourceReserveOutcome =
  | Readonly<{
      status: 'reserved' | 'already_reserved_same_execution';
      token: AgentSourceOwnershipToken;
    }>
  | Readonly<{
      status:
        | 'unavailable'
        | 'source_limit'
        | 'skipped_budget'
        | 'stale_inputs';
    }>;
export type AgentSourceReserveResult =
  | AgentSourceReserveOutcome
  | Readonly<{ status: 'rejected_candidate' | 'rejected_receipt' }>;
export interface AgentSourceReviewReceipt extends AgentSourceBinding {
  readonly receiptId: string;
  readonly work: AgentSourceWork;
  readonly postIds: readonly string[];
}
export interface AgentSourceFailureReceipt extends AgentSourceBinding {
  readonly receiptId: string;
  readonly work: AgentSourceWork;
  readonly status: 'failed' | 'cancelled';
  readonly postIds: readonly string[];
}
export interface AgentSourceOperatorReceipt extends AgentSourceBinding {
  readonly actionId: string;
  readonly actorId: string;
  readonly reason: string;
}
export interface ConsumeAgentSourceCommand {
  readonly token: AgentSourceOwnershipToken;
  readonly receipt: AgentSourceReviewReceipt;
}
export interface ReleaseAgentSourceFailureCommand {
  readonly token: AgentSourceOwnershipToken;
  readonly receipt: AgentSourceFailureReceipt;
}
export interface ReuseAgentSourceCommand {
  readonly token: AgentSourceOwnershipToken;
  readonly receipt: AgentSourceOperatorReceipt;
}
export type AgentSourceTransitionOutcome = Readonly<{
  status:
    | 'applied'
    | 'already_applied'
    | 'stale_token'
    | 'invalid_state'
    | 'receipt_mismatch';
}>;
export type AgentSourceTransitionResult =
  | AgentSourceTransitionOutcome
  | Readonly<{ status: 'rejected_receipt' }>;

/**
 * Atomic persistence port, deliberately without a production implementation.
 * tryReserve must re-read scoped nondeleted eligibility, compare immutable inputs,
 * and lock/enforce source uniqueness plus aggregate execution slots/commitments.
 * Same-execution identical replay returns its original token without double counting.
 * Reserved foreign owners and consumed rows are unavailable; released rows require
 * a new execution and a generation increment. Same-execution failed retries reject.
 * Transitions compare every token field and canonical work. Consume requires persisted
 * review drafts; identical receipts replay, mismatches reject. Failure release requires
 * terminal no-draft work and cannot release consumed/partially successful work.
 * Reuse only releases consumed rows, records actor/reason/action, increments generation,
 * and replays the same operator action idempotently. No TTL unlocking is permitted.
 * Persist historical receipts and commitments for reconciliation after operator reuse;
 * current-row overwrite must not erase historical execution evidence.
 * Implementations must validate receipt authority in persistence, not JSON shape alone.
 */
export interface AgentSourceReservationStore {
  tryReserve(
    command: ReserveAgentSourceCommand,
  ): Promise<AgentSourceReserveOutcome>;
  consume(
    command: ConsumeAgentSourceCommand,
  ): Promise<AgentSourceTransitionOutcome>;
  releaseFailure(
    command: ReleaseAgentSourceFailureCommand,
  ): Promise<AgentSourceTransitionOutcome>;
  releaseConsumedForReuse(
    command: ReuseAgentSourceCommand,
  ): Promise<AgentSourceTransitionOutcome>;
}
