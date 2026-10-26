/**
 * Noise analysis over scored rows (#5600). Pure: no provider calls, so it runs
 * on partial (spend-aborted) outcomes and on stub runs alike.
 *
 * Unit of analysis is the case (fixture row). Repeats of one case are averaged
 * first, so a contestant's interval is over cases, not over repeats that share
 * a prompt. A challenger is only named better when the paired-difference
 * interval excludes zero.
 */

import { rowScore } from '../outliers/analyze';
import type { ScoredRow } from '../rows';
import type {
  NoiseComparison,
  NoiseContestant,
  NoiseSection,
  NoiseVerdict,
} from './contracts';
import { NOISE_SATURATION_THRESHOLD, NOISE_SECTION_VERSION } from './contracts';
import { estimate, mean, pooledSd } from './stats';

const NOISE_SUITES = new Set<ScoredRow['suite']>(['ladder', 'harness-ab']);

/** Rows grouped as contestant → case → repeat scores. */
type ScoresByCase = Map<string, Map<string, number[]>>;

function repeatsOf(row: ScoredRow): number {
  return (row.repeatIndex ?? 0) + 1;
}

function groupScores(rows: ScoredRow[]): {
  order: string[];
  scores: ScoresByCase;
} {
  const order: string[] = [];
  const scores: ScoresByCase = new Map();
  for (const row of rows) {
    const id = row.contestant?.id;
    if (!id) {
      continue;
    }
    if (!scores.has(id)) {
      scores.set(id, new Map());
      order.push(id);
    }
    const score = row.voidReason === null ? rowScore(row) : null;
    if (score === null) {
      continue;
    }
    const cases = scores.get(id) as Map<string, number[]>;
    cases.set(row.fixtureId, [...(cases.get(row.fixtureId) ?? []), score]);
  }

  return { order, scores };
}

function caseMeans(cases: Map<string, number[]>): Map<string, number> {
  const means = new Map<string, number>();
  for (const [fixtureId, values] of cases) {
    const average = mean(values);
    if (average !== null) {
      means.set(fixtureId, average);
    }
  }

  return means;
}

function verdictOf(difference: ReturnType<typeof estimate>): {
  verdict: NoiseVerdict;
  winner: 'challenger' | 'baseline' | null;
} {
  if (difference.ci95 === null) {
    return { verdict: 'insufficient-data', winner: null };
  }
  if (difference.ci95.lower > 0) {
    return { verdict: 'challenger-better', winner: 'challenger' };
  }
  if (difference.ci95.upper < 0) {
    return { verdict: 'baseline-better', winner: 'baseline' };
  }

  return { verdict: 'within-noise', winner: null };
}

function errorsFor(rows: ScoredRow[], contestantId: string) {
  const own = rows.filter((row) => row.contestant?.id === contestantId);
  const voided = own.filter((row) => row.voidReason !== null);
  const reasonOf = (row: ScoredRow): string => row.voidReason ?? '';
  const timeouts = voided.filter((row) => /time(d)? ?out/i.test(reasonOf(row)));
  const generation = voided.filter((row) =>
    reasonOf(row).startsWith('generation failed'),
  );
  const judging = voided.filter((row) =>
    reasonOf(row).startsWith('judging failed'),
  );

  return {
    contestantId,
    generationFailures: generation.length,
    judgingFailures: judging.length,
    otherVoid: voided.length - generation.length - judging.length,
    rows: own.length,
    timeouts: timeouts.length,
  };
}

/** Cases no contestant ever passes, in any repeat: a task or grader defect. */
function alwaysFailingCases(rows: ScoredRow[]) {
  const byCase = new Map<string, ScoredRow[]>();
  for (const row of rows) {
    if (row.voidReason === null && row.isAccepted !== null) {
      byCase.set(row.fixtureId, [...(byCase.get(row.fixtureId) ?? []), row]);
    }
  }

  return [...byCase.entries()]
    .filter(([, answered]) => answered.every((row) => row.isAccepted === false))
    .map(([fixtureId, answered]) => ({ fixtureId, rows: answered.length }))
    .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));
}

function gradeTwiceOf(rows: ScoredRow[]) {
  const regraded = rows.filter(
    (row) =>
      row.regradedIsAccepted !== undefined &&
      row.regradedIsAccepted !== null &&
      row.isAccepted !== null,
  );
  if (regraded.length === 0) {
    return null;
  }
  const changes = regraded.filter(
    (row) => row.regradedIsAccepted !== row.isAccepted,
  ).length;

  return {
    changeRate: changes / regraded.length,
    sampled: regraded.length,
    verdictChanges: changes,
  };
}

/** Undefined when the rows are not a contestant comparison. */
export function analyzeNoise(rows: ScoredRow[]): NoiseSection | undefined {
  const comparable = rows.filter(
    (row) => row.contestant !== null && NOISE_SUITES.has(row.suite),
  );
  if (comparable.length === 0) {
    return undefined;
  }

  const { order, scores } = groupScores(comparable);
  const contestants: NoiseContestant[] = order.map((contestantId) => {
    const cases = scores.get(contestantId) as Map<string, number[]>;
    const own = comparable.filter((row) => row.contestant?.id === contestantId);

    return {
      caseCount: cases.size,
      contestantId,
      repeatSd: pooledSd([...cases.values()]),
      repeats: Math.max(1, ...own.map(repeatsOf)),
      score: estimate([...caseMeans(cases).values()]),
    };
  });

  const [baselineId, ...challengerIds] = order;
  const comparisons: NoiseComparison[] = [];
  if (baselineId !== undefined) {
    const baselineMeans = caseMeans(
      scores.get(baselineId) as Map<string, number[]>,
    );
    for (const challengerId of challengerIds) {
      const challengerMeans = caseMeans(
        scores.get(challengerId) as Map<string, number[]>,
      );
      const paired = [...challengerMeans.entries()]
        .filter(([fixtureId]) => baselineMeans.has(fixtureId))
        .map(
          ([fixtureId, value]) =>
            value - (baselineMeans.get(fixtureId) as number),
        );
      const difference = estimate(paired);
      const { verdict, winner } = verdictOf(difference);
      comparisons.push({
        baselineId,
        challengerId,
        difference,
        verdict,
        winnerId:
          winner === 'challenger'
            ? challengerId
            : winner === 'baseline'
              ? baselineId
              : null,
      });
    }
  }

  const baseline = contestants[0];
  const baselineMean = baseline?.score.mean ?? null;
  const isBaselineSaturated =
    baselineMean !== null && baselineMean >= NOISE_SATURATION_THRESHOLD;
  const failing = alwaysFailingCases(comparable);
  const errors = order.map((id) => errorsFor(comparable, id));
  const gradeTwice = gradeTwiceOf(comparable);

  const warnings: string[] = [];
  if (isBaselineSaturated && baselineMean !== null) {
    warnings.push(
      `Baseline scores ${(baselineMean * 100).toFixed(1)}%: no headroom to measure a quality gain. Compare cost at parity instead.`,
    );
  }
  if (failing.length > 0) {
    warnings.push(
      `${failing.length} case(s) failed in every repeat for every contestant (suspected task or grader defect): ${failing.map((entry) => entry.fixtureId).join(', ')}.`,
    );
  }
  if (gradeTwice && gradeTwice.verdictChanges > 0) {
    warnings.push(
      `The judge changed its accept verdict on ${gradeTwice.verdictChanges}/${gradeTwice.sampled} regraded outputs: score gaps inside that instability are noise.`,
    );
  }
  for (const entry of errors) {
    const failures = entry.generationFailures + entry.judgingFailures;
    if (failures > 0 || entry.timeouts > 0) {
      warnings.push(
        `${entry.contestantId}: ${entry.generationFailures} generation and ${entry.judgingFailures} judging failures (${entry.timeouts} timeouts) are excluded from scores, not counted as variance.`,
      );
    }
  }

  return {
    comparisons,
    contestants,
    diagnostics: {
      alwaysFailingCases: failing,
      errors,
      gradeTwice,
      isBaselineSaturated,
      warnings,
    },
    version: NOISE_SECTION_VERSION,
  };
}
