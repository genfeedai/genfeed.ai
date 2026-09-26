/**
 * Pairwise verdicts. Each pair gets two independent signals:
 *
 * - pointwise: both answers scored alone on the locked rubric, compared with
 *   a tie band — position cannot bias it because the judge never sees both;
 * - ordered: autoevals Battle run in both orderings (A-then-B, B-then-A). A
 *   judge that prefers whichever answer it saw first flips between them;
 *   that pair counts toward the position-bias rate and is scored a tie.
 *
 * The ordered verdict wins when both orderings ran, since it is the direct
 * comparison; the pointwise verdict stands in when they did not. Choices are
 * always from the challenger's side: `a` = challenger, `b` = baseline.
 */

import type { OrderedChoice, PairwiseChoice } from '../contracts';

export function pointwiseChoice(
  challengerScore: number | null,
  baselineScore: number | null,
  tieBand: number,
): PairwiseChoice | null {
  if (challengerScore === null || baselineScore === null) {
    return null;
  }
  if (Math.abs(challengerScore - baselineScore) <= tieBand) {
    return 'tie';
  }

  return challengerScore > baselineScore ? 'a' : 'b';
}

/**
 * @param challengerFirstPreferred Battle verdict with the challenger shown first.
 * @param baselineFirstPreferred Battle verdict with the baseline shown first.
 */
export function orderedChoice(
  challengerFirstPreferred: boolean | null,
  baselineFirstPreferred: boolean | null,
): OrderedChoice {
  if (challengerFirstPreferred === null || baselineFirstPreferred === null) {
    return { choice: null, isPositionBiased: null };
  }
  // Consistent only when exactly one ordering preferred its first answer.
  if (challengerFirstPreferred === baselineFirstPreferred) {
    return { choice: 'tie', isPositionBiased: true };
  }

  return {
    choice: challengerFirstPreferred ? 'a' : 'b',
    isPositionBiased: false,
  };
}

export function reconcileVerdict(
  ordered: PairwiseChoice | null,
  pointwise: PairwiseChoice | null,
): PairwiseChoice | null {
  return ordered ?? pointwise;
}

/** Share of both-ordering pairs whose verdict flipped with the ordering. */
export function positionBiasRate(flags: Array<boolean | null>): number | null {
  const measured = flags.filter((flag): flag is boolean => flag !== null);
  if (measured.length === 0) {
    return null;
  }

  return measured.filter(Boolean).length / measured.length;
}
