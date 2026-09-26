/**
 * Outlier analysis over a finished content-eval run (#5234). Pure functions on
 * scores the run already produced — no provider calls, no I/O.
 */

import {
  DEFAULT_OUTLIER_THRESHOLDS,
  OUTLIER_CLASSES,
  type OutlierClass,
  type OutlierClassCounts,
  type OutlierInputCase,
  type OutlierMissingField,
  type OutlierRate,
  type OutlierRecord,
  type OutlierSection,
  type OutlierThresholds,
  outlierInputCaseSchema,
  outlierThresholdsSchema,
} from './contracts';

interface OutlierFinding {
  class: OutlierClass;
  reason: string;
  severity: number;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

type OutlierCaseIdentity = Pick<
  OutlierInputCase,
  'contentKind' | 'contestant' | 'fixtureId'
>;

function caseKey(evalCase: OutlierCaseIdentity): string {
  return `${evalCase.contentKind}:${evalCase.fixtureId}:${evalCase.contestant.id}`;
}

function judgeScores(evalCase: OutlierInputCase): number[] {
  return evalCase.votes.flatMap((vote) =>
    vote.score === null ? [] : [vote.score],
  );
}

/** Mean judge score; null when no judge produced one (pairwise-only, void). */
export function caseScore(evalCase: OutlierInputCase): number | null {
  const scores = judgeScores(evalCase);
  return scores.length === 0
    ? null
    : scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/** Linear interpolation between closest ranks (R type 7). */
export function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;

  return lowerValue + (position - lower) * (upperValue - lowerValue);
}

export function findMissingFields(
  evalCase: OutlierInputCase,
): OutlierMissingField[] {
  const missing: OutlierMissingField[] = [];
  if (evalCase.input === undefined) missing.push('input');
  if (evalCase.artifactRef === null) missing.push('artifactRef');
  if (evalCase.votes.length === 0) missing.push('votes');
  if (evalCase.votes.some((vote) => vote.rationale === null)) {
    missing.push('rationale');
  }
  return missing;
}

function detectJudgeHumanDisagreement(
  evalCase: OutlierInputCase,
  thresholds: OutlierThresholds,
): OutlierFinding | null {
  const label = evalCase.humanLabel;
  if (!label) {
    return null;
  }

  const tolerance = thresholds.judgeHumanBandTolerance;
  const divergent = evalCase.votes.flatMap((vote) => {
    if (vote.score === null) return [];
    const distance =
      vote.score < label.band.min
        ? label.band.min - vote.score
        : vote.score - label.band.max;
    return distance > tolerance ? [{ distance, vote }] : [];
  });
  if (divergent.length === 0) {
    return null;
  }

  const judges = divergent
    .map(
      ({ vote }) => `${vote.judgeRegistryKey}=${formatScore(vote.score ?? 0)}`,
    )
    .join(', ');

  return {
    class: 'judge_human_disagreement',
    reason: `${divergent.length} of ${evalCase.votes.length} judges scored outside the human band [${formatScore(label.band.min)}, ${formatScore(label.band.max)}] ± ${formatScore(tolerance)}: ${judges}`,
    severity: Math.max(...divergent.map(({ distance }) => distance)),
  };
}

function detectJudgeDisagreement(
  evalCase: OutlierInputCase,
  thresholds: OutlierThresholds,
): OutlierFinding | null {
  const scores = judgeScores(evalCase);
  const spread =
    scores.length < 2 ? 0 : Math.max(...scores) - Math.min(...scores);
  const choices = new Set(
    evalCase.votes.flatMap((vote) =>
      vote.choice === null ? [] : [vote.choice],
    ),
  );
  const isSplitVerdict = choices.size > 1;
  const isWideSpread = spread > thresholds.judgeSpreadMax;
  if (!isSplitVerdict && !isWideSpread) {
    return null;
  }

  const reasons = [
    ...(isWideSpread
      ? [
          `judge spread ${formatScore(spread)} > ${formatScore(thresholds.judgeSpreadMax)}`,
        ]
      : []),
    ...(isSplitVerdict
      ? [`split pairwise verdict (${[...choices].sort().join(' / ')})`]
      : []),
  ];

  return {
    class: 'judge_disagreement',
    reason: reasons.join('; '),
    // A split verdict is a full disagreement; a spread is as wide as it is.
    severity: isSplitVerdict ? 1 : spread,
  };
}

interface ExtremeScoreResult {
  findings: Map<string, OutlierFinding>;
  skippedGroups: OutlierSection['extremeScoreSkippedGroups'];
}

function detectExtremeScores(
  cases: OutlierInputCase[],
  thresholds: OutlierThresholds,
): ExtremeScoreResult {
  const groups = new Map<
    string,
    { evalCase: OutlierInputCase; score: number }[]
  >();
  for (const evalCase of cases) {
    const score = caseScore(evalCase);
    if (score === null || evalCase.voidReason !== null) continue;
    const groupKey = `${evalCase.contentKind}\u0000${evalCase.contestant.id}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ evalCase, score });
    groups.set(groupKey, group);
  }

  const findings = new Map<string, OutlierFinding>();
  const skippedGroups: OutlierSection['extremeScoreSkippedGroups'] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length < thresholds.extremeScoreMinGroupSize) {
      skippedGroups.push({
        contentKind: first.evalCase.contentKind,
        contestantKey: first.evalCase.contestant.id,
        scoredCaseCount: group.length,
      });
      continue;
    }

    const scores = group.map(({ score }) => score);
    const low = quantile(scores, thresholds.extremeScoreLowPercentile);
    const high = quantile(scores, thresholds.extremeScoreHighPercentile);
    const lowLabel = `p${Math.round(thresholds.extremeScoreLowPercentile * 100)}`;
    const highLabel = `p${Math.round(thresholds.extremeScoreHighPercentile * 100)}`;
    for (const { evalCase, score } of group) {
      if (score < low) {
        findings.set(caseKey(evalCase), {
          class: 'extreme_score',
          reason: `score ${formatScore(score)} below ${lowLabel} ${formatScore(low)} of ${group.length} ${evalCase.contentKind} cases for ${evalCase.contestant.id}`,
          severity: low - score,
        });
      } else if (score > high) {
        findings.set(caseKey(evalCase), {
          class: 'extreme_score',
          reason: `score ${formatScore(score)} above ${highLabel} ${formatScore(high)} of ${group.length} ${evalCase.contentKind} cases for ${evalCase.contestant.id}`,
          severity: score - high,
        });
      }
    }
  }

  return { findings, skippedGroups };
}

function median(values: number[]): number | null {
  return values.length === 0 ? null : quantile(values, 0.5);
}

function detectCostLatency(
  cases: OutlierInputCase[],
  thresholds: OutlierThresholds,
): Map<string, OutlierFinding> {
  const medianCost = median(
    cases.flatMap((evalCase) =>
      evalCase.costCredits === null ? [] : [evalCase.costCredits],
    ),
  );
  const medianLatency = median(
    cases.flatMap((evalCase) =>
      evalCase.latencyMs === null ? [] : [evalCase.latencyMs],
    ),
  );

  const findings = new Map<string, OutlierFinding>();
  for (const evalCase of cases) {
    const reasons: string[] = [];
    let severity = 0;
    if (
      evalCase.costCredits !== null &&
      medianCost !== null &&
      medianCost > 0 &&
      evalCase.costCredits > medianCost * thresholds.costMultiple
    ) {
      const ratio = evalCase.costCredits / medianCost;
      reasons.push(
        `cost ${evalCase.costCredits} credits is ${ratio.toFixed(1)}× the run median ${medianCost} (limit ${thresholds.costMultiple}×)`,
      );
      severity = Math.max(severity, ratio);
    }
    if (
      evalCase.latencyMs !== null &&
      medianLatency !== null &&
      medianLatency > 0 &&
      evalCase.latencyMs > medianLatency * thresholds.latencyMultiple
    ) {
      const ratio = evalCase.latencyMs / medianLatency;
      reasons.push(
        `latency ${evalCase.latencyMs}ms is ${ratio.toFixed(1)}× the run median ${medianLatency}ms (limit ${thresholds.latencyMultiple}×)`,
      );
      severity = Math.max(severity, ratio);
    }
    if (reasons.length > 0) {
      findings.set(caseKey(evalCase), {
        class: 'cost_latency',
        reason: reasons.join('; '),
        severity,
      });
    }
  }

  return findings;
}

function toRecord(
  evalCase: OutlierInputCase,
  finding: OutlierFinding,
): OutlierRecord {
  return {
    id: `${evalCase.runId}:${finding.class}:${caseKey(evalCase)}`,
    runId: evalCase.runId,
    class: finding.class,
    suite: evalCase.suite,
    contentKind: evalCase.contentKind,
    fixtureId: evalCase.fixtureId,
    brandFixtureId: evalCase.brandFixtureId,
    fixtureVisibility: evalCase.fixtureVisibility,
    ...(evalCase.input === undefined ? {} : { input: evalCase.input }),
    contestant: evalCase.contestant,
    artifactRef: evalCase.artifactRef,
    votes: evalCase.votes,
    ...(evalCase.humanLabel ? { humanLabel: evalCase.humanLabel } : {}),
    rubricVersion: evalCase.rubricVersion,
    costCredits: evalCase.costCredits,
    latencyMs: evalCase.latencyMs,
    reason: finding.reason,
    severity: finding.severity,
    missingFields: findMissingFields(evalCase),
  };
}

function emptyClassCounts(): OutlierClassCounts {
  return {
    cost_latency: 0,
    extreme_score: 0,
    judge_disagreement: 0,
    judge_human_disagreement: 0,
  };
}

function buildRates(
  cases: OutlierInputCase[],
  records: OutlierRecord[],
  keyOf: (evalCase: OutlierCaseIdentity) => string,
): OutlierRate[] {
  const rates = new Map<
    string,
    {
      caseKeys: Set<string>;
      outlierKeys: Set<string>;
      byClass: OutlierClassCounts;
    }
  >();
  const entry = (key: string) => {
    const existing = rates.get(key);
    if (existing) return existing;
    const created = {
      byClass: emptyClassCounts(),
      caseKeys: new Set<string>(),
      outlierKeys: new Set<string>(),
    };
    rates.set(key, created);
    return created;
  };

  for (const evalCase of cases) {
    entry(keyOf(evalCase)).caseKeys.add(caseKey(evalCase));
  }
  for (const record of records) {
    const rate = entry(keyOf(record));
    rate.outlierKeys.add(caseKey(record));
    rate.byClass[record.class] += 1;
  }

  return [...rates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, rate]) => ({
      byClass: rate.byClass,
      caseCount: rate.caseKeys.size,
      key,
      outlierCaseCount: rate.outlierKeys.size,
      outlierRate:
        rate.caseKeys.size === 0
          ? 0
          : rate.outlierKeys.size / rate.caseKeys.size,
    }));
}

/** Keeps the worst cases per class × contestant; totals stay complete. */
function capRecords(records: OutlierRecord[], cap: number): OutlierRecord[] {
  const groups = new Map<string, OutlierRecord[]>();
  for (const record of records) {
    const groupKey = `${record.class}\u0000${record.contestant.id}`;
    const group = groups.get(groupKey) ?? [];
    group.push(record);
    groups.set(groupKey, group);
  }

  const classOrder = (outlierClass: OutlierClass) =>
    OUTLIER_CLASSES.indexOf(outlierClass);

  return [...groups.values()]
    .flatMap((group) =>
      [...group]
        .sort(
          (left, right) =>
            right.severity - left.severity || left.id.localeCompare(right.id),
        )
        .slice(0, cap),
    )
    .sort(
      (left, right) =>
        classOrder(left.class) - classOrder(right.class) ||
        left.contestant.id.localeCompare(right.contestant.id) ||
        right.severity - left.severity ||
        left.id.localeCompare(right.id),
    );
}

export function analyzeOutliers(
  cases: OutlierInputCase[],
  thresholds: OutlierThresholds = DEFAULT_OUTLIER_THRESHOLDS,
): OutlierSection {
  const extreme = detectExtremeScores(cases, thresholds);
  const costLatency = detectCostLatency(cases, thresholds);

  const records = cases.flatMap((evalCase) => {
    const key = caseKey(evalCase);
    const findings = [
      detectJudgeHumanDisagreement(evalCase, thresholds),
      detectJudgeDisagreement(evalCase, thresholds),
      extreme.findings.get(key) ?? null,
      costLatency.get(key) ?? null,
    ];
    return findings.flatMap((finding) =>
      finding ? [toRecord(evalCase, finding)] : [],
    );
  });

  const reported = capRecords(
    records,
    thresholds.maxCasesPerClassAndContestant,
  );

  return {
    status: 'ok',
    thresholds,
    caseCount: cases.length,
    cap: { perClassAndContestant: thresholds.maxCasesPerClassAndContestant },
    totals: OUTLIER_CLASSES.map((outlierClass) => ({
      class: outlierClass,
      reported: reported.filter((record) => record.class === outlierClass)
        .length,
      total: records.filter((record) => record.class === outlierClass).length,
    })),
    byContestant: buildRates(cases, records, (row) => row.contestant.id),
    byContentKind: buildRates(cases, records, (row) => row.contentKind),
    extremeScoreSkippedGroups: extreme.skippedGroups,
    cases: reported,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Report hook: validates untrusted report rows and never throws. Outlier
 * analysis must not fail or void the run it describes (#5234 FR 8).
 */
export function analyzeOutliersSafely(
  rows: unknown,
  thresholds: unknown = undefined,
): OutlierSection {
  const parsedThresholds =
    thresholds === undefined
      ? { data: DEFAULT_OUTLIER_THRESHOLDS, success: true as const }
      : outlierThresholdsSchema.safeParse(thresholds);
  const effectiveThresholds = parsedThresholds.success
    ? parsedThresholds.data
    : DEFAULT_OUTLIER_THRESHOLDS;
  const failed = (error: string): OutlierSection => ({
    status: 'failed',
    error,
    thresholds: effectiveThresholds,
    caseCount: Array.isArray(rows) ? rows.length : 0,
    cap: {
      perClassAndContestant: effectiveThresholds.maxCasesPerClassAndContestant,
    },
    totals: OUTLIER_CLASSES.map((outlierClass) => ({
      class: outlierClass,
      reported: 0,
      total: 0,
    })),
    byContestant: [],
    byContentKind: [],
    extremeScoreSkippedGroups: [],
    cases: [],
  });

  if (!parsedThresholds.success) {
    return failed(
      `invalid outlier thresholds: ${parsedThresholds.error.message}`,
    );
  }

  const parsedRows = outlierInputCaseSchema.array().safeParse(rows);
  if (!parsedRows.success) {
    return failed(`invalid scored rows: ${parsedRows.error.message}`);
  }

  try {
    return analyzeOutliers(parsedRows.data, effectiveThresholds);
  } catch (error: unknown) {
    return failed(describeError(error));
  }
}
