import { LEARNING_ARMS, type LearningArmId } from './strategies';
export interface LearningEvaluationRow {
  accountGroup: string;
  armId: LearningArmId;
  reward: number;
  loggedProbability: number | null;
  loggingProbabilities: Record<LearningArmId, number> | null;
  decisionAt: string;
  candidateProbabilities: Record<LearningArmId, number>;
  predictions: Record<LearningArmId, number>;
  split: string;
}
export interface LearningEstimate {
  value: number | null;
  lower95: number | null;
  upper95: number | null;
  unavailableReasons: string[];
}
export interface LearningEvaluationReport {
  status: 'passed' | 'failed' | 'inconclusive';
  reasons: string[];
  count: number;
  excluded: number;
  missingProbabilities: number;
  ips: LearningEstimate;
  snips: LearningEstimate;
  doublyRobust: LearningEstimate;
  direct: LearningEstimate;
  ess: number | null;
  essUnavailableReasons: string[];
  clippedSensitivity: LearningEstimate;
  bootstrapReplicates: number;
  observedArmCounts: Record<string, number>;
}
export function learningSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
export function validLearningDistribution(
  value: unknown,
): value is Record<LearningArmId, number> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      (key) => !LEARNING_ARMS.includes(key as LearningArmId),
    )
  )
    return false;
  const entries: Record<string, unknown> = value as Record<string, unknown>;
  return (
    LEARNING_ARMS.every(
      (arm) =>
        arm in entries &&
        typeof entries[arm] === 'number' &&
        Number.isFinite(entries[arm]) &&
        Number(entries[arm]) >= 0 &&
        Number(entries[arm]) <= 1,
    ) &&
    Math.abs(
      LEARNING_ARMS.reduce((sum, arm) => sum + Number(entries[arm]), 0) - 1,
    ) < 1e-9
  );
}
function sum(values: readonly number[]): number {
  let result = 0,
    correction = 0;
  for (const value of values) {
    const adjusted = value - correction,
      next = result + adjusted;
    correction = next - result - adjusted;
    result = next;
  }
  return result;
}
function statistics(rows: readonly LearningEvaluationRow[]) {
  if (!rows.length)
    return {
      ips: null,
      snips: null,
      doublyRobust: null,
      direct: null,
      ess: null,
      clippedSensitivity: null,
    };
  const weights = rows.map(
    (row) =>
      row.candidateProbabilities[row.armId] / (row.loggedProbability ?? 1),
  );
  const max = weights.reduce((largest, value) => Math.max(largest, value), 0),
    finiteWeights = weights.every(Number.isFinite);
  const scaled = finiteWeights && max > 0 ? weights.map((w) => w / max) : null;
  const scaledSum = scaled ? sum(scaled) : 0;
  const n = rows.length;
  const finite = (value: number) => (Number.isFinite(value) ? value : null);
  return {
    ips: finiteWeights
      ? finite(sum(rows.map((row, i) => (weights[i] * row.reward) / n)))
      : null,
    snips:
      scaled && scaledSum > 0
        ? finite(sum(rows.map((row, i) => scaled[i] * row.reward)) / scaledSum)
        : null,
    doublyRobust: finiteWeights
      ? finite(
          sum(
            rows.map(
              (row, i) =>
                (sum(
                  LEARNING_ARMS.map(
                    (arm) =>
                      row.candidateProbabilities[arm] * row.predictions[arm],
                  ),
                ) +
                  weights[i] * (row.reward - row.predictions[row.armId])) /
                n,
            ),
          ),
        )
      : null,
    direct: finite(sum(rows.map((row) => row.reward / n))),
    ess:
      scaled && scaledSum > 0
        ? finite(
            (scaledSum * scaledSum) /
              sum(scaled.map((weight) => weight * weight)),
          )
        : null,
    clippedSensitivity: finite(
      sum(rows.map((row, i) => (Math.min(20, weights[i]) * row.reward) / n)),
    ),
  };
}
export function evaluateLearningPolicy(
  rows: readonly LearningEvaluationRow[],
  manifestHash: string,
  input: {
    shared: boolean;
    synthetic: boolean;
    differentialCensoring: number;
    semanticChange: boolean;
  },
): LearningEvaluationReport {
  const reasons: string[] = [],
    valid: LearningEvaluationRow[] = [];
  let missingProbabilities = 0;
  for (const row of rows) {
    if (!['temporal_holdout', 'account_holdout'].includes(row.split)) continue;
    if (row.loggingProbabilities === null || row.loggedProbability === null) {
      missingProbabilities++;
      continue;
    }
    if (
      !validLearningDistribution(row.loggingProbabilities) ||
      !validLearningDistribution(row.candidateProbabilities) ||
      !LEARNING_ARMS.includes(row.armId) ||
      !Number.isFinite(row.loggedProbability) ||
      row.loggedProbability <= 0 ||
      Math.abs(row.loggedProbability - row.loggingProbabilities[row.armId]) >
        1e-9 ||
      !LEARNING_ARMS.every(
        (arm) =>
          Number.isFinite(row.predictions[arm]) &&
          Math.abs(row.predictions[arm]) <= 1,
      ) ||
      !Number.isFinite(row.reward) ||
      Math.abs(row.reward) > 1 ||
      !Number.isFinite(new Date(row.decisionAt).getTime())
    ) {
      reasons.push('invalid_probability_vector');
      continue;
    }
    if (
      LEARNING_ARMS.some(
        (arm) =>
          row.candidateProbabilities[arm] > 0 &&
          row.loggingProbabilities?.[arm] === 0,
      )
    )
      reasons.push('unsupported_action');
    valid.push(row);
  }
  const observedArmCounts = Object.fromEntries(
    LEARNING_ARMS.map((arm) => [
      arm,
      valid.filter((row) => row.armId === arm).length,
    ]),
  );
  const point = statistics(valid);
  if (valid.length < 100) reasons.push('insufficient_observations');
  if (point.ess === null || point.ess < 50) reasons.push('low_ess');
  if (
    valid.length &&
    [point.ips, point.snips, point.doublyRobust, point.ess].some(
      (value) => value === null,
    )
  )
    reasons.push('numerical_instability');
  for (const arm of LEARNING_ARMS)
    if (
      valid.some((row) => row.candidateProbabilities[arm] > 0) &&
      observedArmCounts[arm] < 10
    )
      reasons.push(`insufficient_arm:${arm}`);
  if (valid.filter((row) => row.split === 'temporal_holdout').length < 30)
    reasons.push('insufficient_temporal_holdout');
  if (
    input.shared &&
    valid.filter((row) => row.split === 'account_holdout').length < 30
  )
    reasons.push('insufficient_account_holdout');
  const accounts = [...new Set(valid.map((row) => row.accountGroup))];
  if (input.shared && accounts.length < 5)
    reasons.push('insufficient_accounts');
  if (input.synthetic) reasons.push('synthetic_evidence');
  if (input.differentialCensoring > 0.1) reasons.push('differential_censoring');
  if (input.semanticChange) reasons.push('semantic_change');
  const block = (row: LearningEvaluationRow) =>
    input.shared || accounts.length > 1
      ? row.accountGroup
      : String(Math.floor(new Date(row.decisionAt).getTime() / (7 * 86400000)));
  const groups = [...new Set(valid.map(block))].sort(),
    grouped = groups.map((group) =>
      valid.filter((row) => block(row) === group),
    );
  const keys = [
    'ips',
    'snips',
    'doublyRobust',
    'direct',
    'clippedSensitivity',
  ] as const;
  const samples: Record<(typeof keys)[number], number[]> = {
    ips: [],
    snips: [],
    doublyRobust: [],
    direct: [],
    clippedSensitivity: [],
  };
  const random = learningSeededRandom(manifestHash);
  for (let i = 0; i < 2000; i++) {
    const resampled = groups.flatMap(
      () => grouped[Math.floor(random() * groups.length)],
    );
    const values = statistics(resampled);
    for (const key of keys)
      if (values[key] !== null) samples[key].push(values[key]);
  }
  const estimate = (key: (typeof keys)[number]): LearningEstimate => {
    const samplesForKey = samples[key].sort((a, b) => a - b),
      value = point[key];
    if (!valid.length)
      return {
        value: null,
        lower95: null,
        upper95: null,
        unavailableReasons: ['insufficient_observations'],
      };
    if (value === null || samplesForKey.length !== 2000) {
      reasons.push('numerical_instability');
      return {
        value: null,
        lower95: null,
        upper95: null,
        unavailableReasons: ['numerical_instability'],
      };
    }
    return {
      value,
      lower95: samplesForKey[49],
      upper95: samplesForKey[1949],
      unavailableReasons: [],
    };
  };
  const estimates = {
    ips: estimate('ips'),
    snips: estimate('snips'),
    doublyRobust: estimate('doublyRobust'),
    direct: estimate('direct'),
    clippedSensitivity: estimate('clippedSensitivity'),
  };
  const status = reasons.some((reason) =>
    [
      'invalid_probability_vector',
      'unsupported_action',
      'differential_censoring',
      'semantic_change',
    ].includes(reason),
  )
    ? 'failed'
    : reasons.length
      ? 'inconclusive'
      : 'passed';
  return {
    ...estimates,
    status,
    reasons: [...new Set(reasons)],
    count: valid.length,
    excluded: rows.length - valid.length,
    missingProbabilities,
    ess: point.ess,
    essUnavailableReasons:
      point.ess === null
        ? [valid.length ? 'numerical_instability' : 'insufficient_observations']
        : [],
    bootstrapReplicates: 2000,
    observedArmCounts,
  };
}
