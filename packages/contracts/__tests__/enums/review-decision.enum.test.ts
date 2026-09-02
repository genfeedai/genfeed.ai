import { describe, expect, it } from 'vitest';
import {
  isTerminalReviewDecision,
  normalizeReviewDecision,
  PersistedReviewDecision,
  parseReviewDecision,
  REVIEW_DECISIONS,
  ReviewDecision,
  toPersistedReviewDecision,
} from '../../src/enums/review-decision.enum';

describe('review decision vocabulary', () => {
  it('exposes one lowercase product vocabulary with explicit unset', () => {
    expect(REVIEW_DECISIONS).toEqual([
      'approved',
      'rejected',
      'request_changes',
      'unset',
    ]);
  });

  it.each([
    [ReviewDecision.APPROVED, ReviewDecision.APPROVED, 'canonical'],
    [ReviewDecision.REJECTED, ReviewDecision.REJECTED, 'canonical'],
    [
      ReviewDecision.REQUEST_CHANGES,
      ReviewDecision.REQUEST_CHANGES,
      'canonical',
    ],
    [ReviewDecision.UNSET, ReviewDecision.UNSET, 'unset'],
    [PersistedReviewDecision.APPROVED, ReviewDecision.APPROVED, 'legacy_alias'],
    [PersistedReviewDecision.REJECTED, ReviewDecision.REJECTED, 'legacy_alias'],
    [
      PersistedReviewDecision.REQUEST_CHANGES,
      ReviewDecision.REQUEST_CHANGES,
      'legacy_alias',
    ],
    [null, ReviewDecision.UNSET, 'unset'],
    [undefined, ReviewDecision.UNSET, 'unset'],
  ] as const)('maps %s deterministically', (input, decision, kind) => {
    expect(parseReviewDecision(input)).toEqual({ decision, kind });
  });

  it.each(['APPROVE', 'pending', '', 42, { decision: 'approved' }])(
    'fails closed for unknown input %j',
    (input) => {
      expect(parseReviewDecision(input)).toEqual({
        decision: ReviewDecision.UNSET,
        kind: 'unknown',
      });
      expect(normalizeReviewDecision(input)).toBe(ReviewDecision.UNSET);
    },
  );

  it('maps canonical decisions to the retained database labels exhaustively', () => {
    expect(toPersistedReviewDecision(ReviewDecision.APPROVED)).toBe(
      PersistedReviewDecision.APPROVED,
    );
    expect(toPersistedReviewDecision(ReviewDecision.REJECTED)).toBe(
      PersistedReviewDecision.REJECTED,
    );
    expect(toPersistedReviewDecision(ReviewDecision.REQUEST_CHANGES)).toBe(
      PersistedReviewDecision.REQUEST_CHANGES,
    );
    expect(toPersistedReviewDecision(ReviewDecision.UNSET)).toBeNull();
  });

  it('distinguishes resolved decisions from unset', () => {
    expect(isTerminalReviewDecision(ReviewDecision.APPROVED)).toBe(true);
    expect(isTerminalReviewDecision(ReviewDecision.UNSET)).toBe(false);
  });
});
