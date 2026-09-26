/**
 * Outlier analysis over a finished content-eval run (#5234). Pure functions on
 * scores the run already produced — no provider calls, no I/O.
 */

import type {
  FixtureRow,
  PairwiseChoice,
  PairwiseResult,
  ReportAnalyzerInput,
  ScoredRow,
} from '../contracts';
import {
  DEFAULT_OUTLIER_THRESHOLDS,
  JUDGED_OUTPUT_KEY,
  OUTLIER_CLASSES,
  type OutlierAnalysisInput,
  type OutlierClass,
  type OutlierClassCounts,
  type OutlierMissingField,
  type OutlierRate,
  type OutlierRecord,
  type OutlierSection,
  type OutlierThresholds,
  outlierSectionSchema,
  outlierThresholdsSchema,
} from './contracts';

interface OutlierFinding {
  class: OutlierClass;
  pairs: PairwiseResult[];
  reason: string;
  severity: number;
}

type RowIdentity = Pick<ScoredRow, 'contentKind' | 'contestant' | 'fixtureId'>;

function formatScore(value: number): string {
  return value.toFixed(2);
}

export function contestantKey(row: Pick<ScoredRow, 'contestant'>): string {
  return row.contestant?.id ?? JUDGED_OUTPUT_KEY;
}

/** Internal map key; NUL-joined so ids containing `:` cannot collide. */
function rowKey(row: RowIdentity): string {
  return [row.contentKind, row.fixtureId, contestantKey(row)].join('\u0000');
}

function judgeScores(row: ScoredRow): number[] {
  return row.votes.flatMap((vote) => (vote.score === null ? [] : [vote.score]));
}

/** Mean judge score; null when no judge produced one (pairwise-only, void). */
export function rowScore(row: ScoredRow): number | null {
  const scores = judgeScores(row);
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
  row: ScoredRow,
  input: FixtureRow['input'] | null,
): OutlierMissingField[] {
  const missing: OutlierMissingField[] = [];
  if (input === null) missing.push('input');
  if (row.artifactRef === null && row.output === null) missing.push('artifact');
  if (row.votes.length === 0) missing.push('votes');
  if (row.votes.some((vote) => vote.rationale === null)) {
    missing.push('rationale');
  }
  return missing;
}

function detectJudgeHumanDisagreement(
  row: ScoredRow,
  thresholds: OutlierThresholds,
): OutlierFinding | null {
  // A fixture band labels the fixture's own text, so it only measures a
  // judge on judge-suite rows; generated contestant outputs copy the band
  // from their fixture but were never labelled themselves.
  const band = row.contestant === null ? row.humanLabel?.band : null;
  if (!band) {
    return null;
  }

  const tolerance = thresholds.judgeHumanBandTolerance;
  const divergent = row.votes.flatMap((vote) => {
    if (vote.score === null) return [];
    const distance =
      vote.score < band.min ? band.min - vote.score : vote.score - band.max;
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
    pairs: [],
    reason: `${divergent.length} of ${row.votes.length} judges scored outside the human band [${formatScore(band.min)}, ${formatScore(band.max)}] ± ${formatScore(tolerance)}: ${judges}`,
    severity: Math.max(...divergent.map(({ distance }) => distance)),
  };
}

/**
 * Each judge's settled choice. A judge votes once per ordering (normalised
 * to the challenger's side); when its two votes differ it is position-biased,
 * which the run already reports as `positionBiasRate`, so it casts no vote
 * here rather than counting as a disagreement with itself.
 */
function settledJudgeChoices(pair: PairwiseResult): PairwiseChoice[] {
  const byJudge = new Map<string, Set<PairwiseChoice>>();
  for (const vote of pair.battleVotes) {
    if (vote.choice === null) continue;
    const choices = byJudge.get(vote.judgeRegistryKey) ?? new Set();
    choices.add(vote.choice);
    byJudge.set(vote.judgeRegistryKey, choices);
  }
  return [...byJudge.values()].flatMap((choices) =>
    choices.size === 1 ? [...choices] : [],
  );
}

/**
 * Why a pair is split, or null: distinct judges settled on opposite winners,
 * or the ordered battle contradicts the independent pointwise scores.
 */
export function splitPairReason(pair: PairwiseResult): string | null {
  const winners = new Set(
    settledJudgeChoices(pair).filter((choice) => choice !== 'tie'),
  );
  if (winners.size > 1) {
    return `judges split on the winner vs ${pair.baselineId}`;
  }

  const isSignalConflict =
    (pair.orderedChoice === 'a' && pair.pointwiseChoice === 'b') ||
    (pair.orderedChoice === 'b' && pair.pointwiseChoice === 'a');
  return isSignalConflict
    ? `ordered battle (${pair.orderedChoice}) contradicts pointwise scores (${pair.pointwiseChoice}) vs ${pair.baselineId}`
    : null;
}

export function isSplitPair(pair: PairwiseResult): boolean {
  return splitPairReason(pair) !== null;
}

function detectJudgeDisagreement(
  row: ScoredRow,
  splitPairs: PairwiseResult[],
  thresholds: OutlierThresholds,
): OutlierFinding | null {
  const scores = judgeScores(row);
  const spread =
    scores.length < 2 ? 0 : Math.max(...scores) - Math.min(...scores);
  const voteChoices = new Set(
    row.votes.flatMap((vote) => (vote.choice === null ? [] : [vote.choice])),
  );
  const isWideSpread = spread > thresholds.judgeSpreadMax;
  const isSplitVote = voteChoices.size > 1;
  if (!isWideSpread && !isSplitVote && splitPairs.length === 0) {
    return null;
  }

  const reasons = [
    ...(isWideSpread
      ? [
          `judge spread ${formatScore(spread)} > ${formatScore(thresholds.judgeSpreadMax)}`,
        ]
      : []),
    ...(isSplitVote
      ? [`split verdict (${[...voteChoices].sort().join(' / ')})`]
      : []),
    ...splitPairs.flatMap((pair) => {
      const reason = splitPairReason(pair);
      return reason === null ? [] : [reason];
    }),
  ];

  return {
    class: 'judge_disagreement',
    pairs: splitPairs,
    reason: reasons.join('; '),
    // A split verdict is a full disagreement; a spread is as wide as it is.
    severity: isSplitVote || splitPairs.length > 0 ? 1 : spread,
  };
}

interface ExtremeScoreResult {
  findings: Map<string, OutlierFinding>;
  skippedGroups: OutlierSection['extremeScoreSkippedGroups'];
}

function percentileLabel(fraction: number): string {
  return `p${Math.round(fraction * 100)}`;
}

function detectExtremeScores(
  rows: ScoredRow[],
  thresholds: OutlierThresholds,
): ExtremeScoreResult {
  const groups = new Map<string, { row: ScoredRow; score: number }[]>();
  for (const row of rows) {
    const score = rowScore(row);
    if (score === null || row.voidReason !== null) continue;
    const groupKey = `${row.contentKind}\u0000${contestantKey(row)}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ row, score });
    groups.set(groupKey, group);
  }

  const findings = new Map<string, OutlierFinding>();
  const skippedGroups: OutlierSection['extremeScoreSkippedGroups'] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length < thresholds.extremeScoreMinGroupSize) {
      skippedGroups.push({
        contentKind: first.row.contentKind,
        contestantKey: contestantKey(first.row),
        scoredCaseCount: group.length,
      });
      continue;
    }

    const scores = group.map(({ score }) => score);
    const low = quantile(scores, thresholds.extremeScoreLowPercentile);
    const high = quantile(scores, thresholds.extremeScoreHighPercentile);
    for (const { row, score } of group) {
      const scope = `of ${group.length} ${row.contentKind} cases for ${contestantKey(row)}`;
      if (score < low) {
        findings.set(rowKey(row), {
          class: 'extreme_score',
          pairs: [],
          reason: `score ${formatScore(score)} below ${percentileLabel(thresholds.extremeScoreLowPercentile)} ${formatScore(low)} ${scope}`,
          severity: low - score,
        });
      } else if (score > high) {
        findings.set(rowKey(row), {
          class: 'extreme_score',
          pairs: [],
          reason: `score ${formatScore(score)} above ${percentileLabel(thresholds.extremeScoreHighPercentile)} ${formatScore(high)} ${scope}`,
          severity: score - high,
        });
      }
    }
  }

  return { findings, skippedGroups };
}

function detectCostLatency(
  rows: ScoredRow[],
  thresholds: OutlierThresholds,
): Map<string, OutlierFinding> {
  // Voided rows (failed generations) cost and take ~0; letting them into the
  // median would flag healthy rows, or switch the class off entirely.
  const completed = rows.filter((row) => row.voidReason === null);
  const medianCost = quantile(
    completed.map((row) => row.costCredits),
    0.5,
  );
  const medianLatency = quantile(
    completed.map((row) => row.latencyMs),
    0.5,
  );

  const findings = new Map<string, OutlierFinding>();
  for (const row of rows) {
    const reasons: string[] = [];
    let severity = 0;
    if (
      medianCost > 0 &&
      row.costCredits > medianCost * thresholds.costMultiple
    ) {
      const ratio = row.costCredits / medianCost;
      reasons.push(
        `cost ${row.costCredits} credits is ${ratio.toFixed(1)}× the run median ${medianCost} (limit ${thresholds.costMultiple}×)`,
      );
      severity = Math.max(severity, ratio);
    }
    if (
      medianLatency > 0 &&
      row.latencyMs > medianLatency * thresholds.latencyMultiple
    ) {
      const ratio = row.latencyMs / medianLatency;
      reasons.push(
        `latency ${row.latencyMs}ms is ${ratio.toFixed(1)}× the run median ${medianLatency}ms (limit ${thresholds.latencyMultiple}×)`,
      );
      severity = Math.max(severity, ratio);
    }
    if (reasons.length > 0) {
      findings.set(rowKey(row), {
        class: 'cost_latency',
        pairs: [],
        reason: reasons.join('; '),
        severity,
      });
    }
  }

  return findings;
}

function splitPairsByChallengerRow(
  pairs: PairwiseResult[],
): Map<string, PairwiseResult[]> {
  const byRow = new Map<string, PairwiseResult[]>();
  for (const pair of pairs.filter(isSplitPair)) {
    const key = [pair.contentKind, pair.fixtureId, pair.challengerId].join(
      '\u0000',
    );
    byRow.set(key, [...(byRow.get(key) ?? []), pair]);
  }
  return byRow;
}

function toRecord(
  row: ScoredRow,
  finding: OutlierFinding,
  input: FixtureRow['input'] | null,
): OutlierRecord {
  return {
    artifactRef: row.artifactRef,
    brandFixtureId: row.brandFixtureId,
    callIds: row.callIds,
    class: finding.class,
    contentKind: row.contentKind,
    contestant: row.contestant,
    costCredits: row.costCredits,
    fixtureId: row.fixtureId,
    fixtureVisibility: row.fixtureVisibility,
    humanLabel: row.humanLabel,
    id: [
      row.runId,
      finding.class,
      row.contentKind,
      row.fixtureId,
      contestantKey(row),
    ].join(':'),
    input,
    latencyMs: row.latencyMs,
    missingFields: findMissingFields(row, input),
    output: row.output,
    pairs: finding.pairs,
    reason: finding.reason,
    rubricVersion: row.rubricVersion,
    runId: row.runId,
    severity: finding.severity,
    suite: row.suite,
    votes: row.votes,
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
  rows: ScoredRow[],
  records: OutlierRecord[],
  keyOf: (row: RowIdentity) => string,
): OutlierRate[] {
  const rates = new Map<
    string,
    {
      byClass: OutlierClassCounts;
      caseKeys: Set<string>;
      outlierKeys: Set<string>;
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

  for (const row of rows) {
    entry(keyOf(row)).caseKeys.add(rowKey(row));
  }
  for (const record of records) {
    const rate = entry(keyOf(record));
    rate.outlierKeys.add(rowKey(record));
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
    const groupKey = `${record.class}\u0000${contestantKey(record)}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), record]);
  }

  const classOrder = (outlierClass: OutlierClass) =>
    OUTLIER_CLASSES.indexOf(outlierClass);
  const bySeverity = (left: OutlierRecord, right: OutlierRecord) =>
    right.severity - left.severity || left.id.localeCompare(right.id);

  return [...groups.values()]
    .flatMap((group) => [...group].sort(bySeverity).slice(0, cap))
    .sort(
      (left, right) =>
        classOrder(left.class) - classOrder(right.class) ||
        contestantKey(left).localeCompare(contestantKey(right)) ||
        bySeverity(left, right),
    );
}

export function analyzeOutliers({
  fixtureRowsById,
  pairs,
  rows,
  thresholds,
}: OutlierAnalysisInput): OutlierSection {
  const extreme = detectExtremeScores(rows, thresholds);
  const costLatency = detectCostLatency(rows, thresholds);
  const splitPairs = splitPairsByChallengerRow(pairs);

  const records = rows.flatMap((row) => {
    const key = rowKey(row);
    const input = fixtureRowsById.get(row.fixtureId)?.input ?? null;
    const findings = [
      detectJudgeHumanDisagreement(row, thresholds),
      detectJudgeDisagreement(row, splitPairs.get(key) ?? [], thresholds),
      extreme.findings.get(key) ?? null,
      costLatency.get(key) ?? null,
    ];
    return findings.flatMap((finding) =>
      finding ? [toRecord(row, finding, input)] : [],
    );
  });

  const reported = capRecords(
    records,
    thresholds.maxCasesPerClassAndContestant,
  );

  return {
    byContentKind: buildRates(rows, records, (row) => row.contentKind),
    byContestant: buildRates(rows, records, contestantKey),
    cap: { perClassAndContestant: thresholds.maxCasesPerClassAndContestant },
    caseCount: rows.length,
    cases: reported,
    extremeScoreSkippedGroups: extreme.skippedGroups,
    status: 'ok',
    thresholds,
    totals: OUTLIER_CLASSES.map((outlierClass) => ({
      class: outlierClass,
      reported: reported.filter((record) => record.class === outlierClass)
        .length,
      total: records.filter((record) => record.class === outlierClass).length,
    })),
  };
}

function failedSection(
  thresholds: OutlierThresholds,
  caseCount: number,
  error: string,
): OutlierSection {
  return {
    byContentKind: [],
    byContestant: [],
    cap: { perClassAndContestant: thresholds.maxCasesPerClassAndContestant },
    caseCount,
    cases: [],
    error,
    extremeScoreSkippedGroups: [],
    status: 'failed',
    thresholds,
    totals: OUTLIER_CLASSES.map((outlierClass) => ({
      class: outlierClass,
      reported: 0,
      total: 0,
    })),
  };
}

/**
 * Report hook: resolves thresholds (documented defaults when the run set
 * none) and never throws — outlier analysis must not fail or void the run it
 * describes (#5234 FR 8).
 */
export function analyzeRunOutliers(
  input: Omit<ReportAnalyzerInput, 'runId'>,
): OutlierSection {
  const parsed =
    input.thresholds === undefined
      ? null
      : outlierThresholdsSchema.safeParse(input.thresholds);
  if (parsed && !parsed.success) {
    return failedSection(
      DEFAULT_OUTLIER_THRESHOLDS,
      input.rows.length,
      `invalid outlier thresholds: ${parsed.error.message}`,
    );
  }

  const thresholds = parsed?.data ?? DEFAULT_OUTLIER_THRESHOLDS;
  try {
    // The report is schema-parsed as a whole; an invalid section must
    // degrade to `failed` here rather than throw there and fail the run.
    const section = outlierSectionSchema.safeParse(
      analyzeOutliers({ ...input, thresholds }),
    );
    return section.success
      ? section.data
      : failedSection(
          thresholds,
          input.rows.length,
          `invalid outlier section: ${section.error.message}`,
        );
  } catch (error: unknown) {
    return failedSection(
      thresholds,
      input.rows.length,
      error instanceof Error ? error.message : String(error),
    );
  }
}
