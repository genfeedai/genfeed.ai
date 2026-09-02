/**
 * Canonical product vocabulary for human review outcomes.
 *
 * Lowercase values cross every product boundary: batch JSON, review events,
 * serializers, filters, agents, analytics, and UI. `unset` is explicit so a
 * missing, unknown, or unreviewed value can never be mistaken for approval.
 */
export const ReviewDecision = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REQUEST_CHANGES: 'request_changes',
  UNSET: 'unset',
} as const;

export type ReviewDecision =
  (typeof ReviewDecision)[keyof typeof ReviewDecision];

export type TerminalReviewDecision = Exclude<
  ReviewDecision,
  typeof ReviewDecision.UNSET
>;

export const REVIEW_DECISIONS = Object.values(ReviewDecision);

/**
 * Compatibility labels retained only for the existing Postgres
 * `ReviewDecision` enum. The database wire values remain uppercase; all
 * product-facing reads and writes must cross the mappers below.
 */
export const PersistedReviewDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export type PersistedReviewDecision =
  (typeof PersistedReviewDecision)[keyof typeof PersistedReviewDecision];

export type ReviewDecisionParseKind =
  | 'canonical'
  | 'legacy_alias'
  | 'unknown'
  | 'unset';

export type ReviewDecisionParseResult = {
  decision: ReviewDecision;
  kind: ReviewDecisionParseKind;
};

const CANONICAL_DECISIONS = new Set<string>(REVIEW_DECISIONS);

const LEGACY_REVIEW_DECISION_ALIASES: Readonly<
  Record<PersistedReviewDecision, TerminalReviewDecision>
> = {
  [PersistedReviewDecision.APPROVED]: ReviewDecision.APPROVED,
  [PersistedReviewDecision.REJECTED]: ReviewDecision.REJECTED,
  [PersistedReviewDecision.REQUEST_CHANGES]: ReviewDecision.REQUEST_CHANGES,
};

/**
 * Parse canonical values and the three historical Postgres labels.
 * Unknown input fails closed to `unset`; callers that migrate data can report
 * `kind === 'unknown'` without ever treating the source value as approval.
 */
export function parseReviewDecision(value: unknown): ReviewDecisionParseResult {
  if (value == null) {
    return { decision: ReviewDecision.UNSET, kind: 'unset' };
  }

  if (typeof value !== 'string') {
    return { decision: ReviewDecision.UNSET, kind: 'unknown' };
  }

  if (CANONICAL_DECISIONS.has(value)) {
    return {
      decision: value as ReviewDecision,
      kind: value === ReviewDecision.UNSET ? 'unset' : 'canonical',
    };
  }

  const legacyDecision =
    LEGACY_REVIEW_DECISION_ALIASES[value as PersistedReviewDecision];
  if (legacyDecision) {
    return { decision: legacyDecision, kind: 'legacy_alias' };
  }

  return { decision: ReviewDecision.UNSET, kind: 'unknown' };
}

export function normalizeReviewDecision(value: unknown): ReviewDecision {
  return parseReviewDecision(value).decision;
}

export function toPersistedReviewDecision(
  decision: ReviewDecision,
): PersistedReviewDecision | null {
  switch (decision) {
    case ReviewDecision.APPROVED:
      return PersistedReviewDecision.APPROVED;
    case ReviewDecision.REJECTED:
      return PersistedReviewDecision.REJECTED;
    case ReviewDecision.REQUEST_CHANGES:
      return PersistedReviewDecision.REQUEST_CHANGES;
    case ReviewDecision.UNSET:
      return null;
  }
}

export function isTerminalReviewDecision(
  decision: ReviewDecision,
): decision is TerminalReviewDecision {
  return decision !== ReviewDecision.UNSET;
}
