import type { FixtureRow } from '../../../../../scripts/content-eval/rows';
import { AGREEMENT_FLOOR, GOLDEN_LABEL_SOURCES } from './golden-set.constants';
import type {
  GoldenCandidate,
  GoldenDecision,
  GoldenLabel,
  GoldenLabelSource,
  GoldenSetExcluded,
  GoldenSourceAgreement,
} from './golden-set.types';
import { scoreToBand } from './row-mapping';

type DecisionPair = readonly [GoldenDecision, GoldenDecision];
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function buildPairs(
  candidates: Iterable<GoldenCandidate>,
): Map<GoldenLabelSource, DecisionPair[]> {
  const pairs = new Map<GoldenLabelSource, DecisionPair[]>(
    GOLDEN_LABEL_SOURCES.map((source) => [source, []]),
  );
  for (const candidate of candidates) {
    for (let i = 0; i < candidate.labels.length; i++) {
      const left = candidate.labels[i];
      if (!left || left.decision === null) continue;
      for (const right of candidate.labels.slice(i + 1)) {
        if (
          right.decision === null ||
          (left.source === right.source && left.raterKey === right.raterKey)
        )
          continue;
        if (left.source === right.source) {
          pairs
            .get(left.source)
            ?.push(
              compare(left.raterKey, right.raterKey) <= 0
                ? [left.decision, right.decision]
                : [right.decision, left.decision],
            );
        } else {
          pairs.get(left.source)?.push([left.decision, right.decision]);
          pairs.get(right.source)?.push([right.decision, left.decision]);
        }
      }
    }
  }
  return pairs;
}
export function computeSourceAgreement(
  candidates: Iterable<GoldenCandidate>,
): GoldenSourceAgreement[] {
  const values = [...candidates];
  const pairsBySource = buildPairs(values);
  return GOLDEN_LABEL_SOURCES.map((source) => {
    const pairs = pairsBySource.get(source) ?? [];
    const n = pairs.length;
    const po = n === 0 ? null : pairs.filter(([a, b]) => a === b).length / n;
    const pA1 = n === 0 ? 0 : pairs.filter(([a]) => a === 'approve').length / n;
    const pA2 =
      n === 0 ? 0 : pairs.filter(([, b]) => b === 'approve').length / n;
    const pe = pA1 * pA2 + (1 - pA1) * (1 - pA2);
    const kappa = po === null || 1 - pe === 0 ? null : (po - pe) / (1 - pe);
    const status =
      n < AGREEMENT_FLOOR.minPairs
        ? 'insufficient-overlap'
        : (
              kappa !== null
                ? kappa >= AGREEMENT_FLOOR.minKappa
                : po !== null &&
                  po >= AGREEMENT_FLOOR.minPercentAgreementWhenKappaUndefined
            )
          ? 'kept'
          : 'dropped';
    return {
      source,
      labels: values.reduce(
        (sum, candidate) =>
          sum +
          candidate.labels.filter((label) => label.source === source).length,
        0,
      ),
      pairs: n,
      percentAgreement: po === null ? null : round(po),
      kappa: kappa === null ? null : round(kappa),
      status,
    };
  });
}
export function applyAgreementFloor(
  candidates: Iterable<GoldenCandidate>,
  agreement: readonly GoldenSourceAgreement[],
): GoldenCandidate[] {
  const dropped = new Set(
    agreement
      .filter((source) => source.status === 'dropped')
      .map((source) => source.source),
  );
  return [...candidates].map((candidate) => ({
    ...candidate,
    labels: candidate.labels.filter((label) => !dropped.has(label.source)),
  }));
}
function compareLabelOrder(left: GoldenLabel, right: GoldenLabel): number {
  return (
    left.order[0] - right.order[0] || compare(left.order[1], right.order[1])
  );
}
export function resolveRows(
  candidates: Iterable<GoldenCandidate>,
  excluded: GoldenSetExcluded,
) {
  return [...candidates].flatMap((candidate) => {
    const decisions = new Set(
      candidate.labels.flatMap((label) =>
        label.decision === null ? [] : [label.decision],
      ),
    );
    if (decisions.size > 1) {
      excluded.conflict++;
      return [];
    }
    const scoreLabel = candidate.labels
      .filter(
        (label) => label.source === 'evaluation-score' && label.score !== null,
      )
      .sort(compareLabelOrder)
      .at(-1);
    const scoreBand =
      scoreLabel?.score === null || scoreLabel?.score === undefined
        ? undefined
        : scoreToBand(scoreLabel.score);
    const decision = [...decisions][0];
    if (decision === undefined && scoreBand === undefined) {
      excluded.noLabel++;
      return [];
    }
    const expected: FixtureRow['expected'] = {
      ...(decision === undefined ? {} : { decision }),
      ...(scoreBand === undefined ? {} : { scoreBand }),
    };
    const sources = [
      ...new Set(candidate.labels.map((label) => label.source)),
    ].sort(compare);
    return [{ candidate, expected, sources }];
  });
}
