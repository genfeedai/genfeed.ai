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
export interface LearningEvaluationReport {
  status: 'passed' | 'failed' | 'inconclusive';
  reasons: string[];
  count: number;
  excluded: number;
  ips: number;
  snips: number;
  doublyRobust: number;
  direct: number;
  ess: number;
  clippedSensitivity: number;
  lower95: number;
  upper95: number;
  bootstrapReplicates: number;
  observedArmCounts: Record<string, number>;
}
function seeded(seed: string): () => number {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
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
  for (const row of rows) {
    if (row.split !== 'temporal_holdout' && row.split !== 'account_holdout')
      continue;
    const distributionValid = (value: Record<LearningArmId, number> | null) =>
      value != null &&
      Object.keys(value).length === 3 &&
      Object.keys(value).every((key) =>
        LEARNING_ARMS.includes(key as LearningArmId),
      ) &&
      LEARNING_ARMS.every(
        (arm) =>
          Number.isFinite(value[arm]) && value[arm] >= 0 && value[arm] <= 1,
      ) &&
      Math.abs(LEARNING_ARMS.reduce((sum, arm) => sum + value[arm], 0) - 1) <
        1e-9;
    if (
      !distributionValid(row.candidateProbabilities) ||
      !distributionValid(row.loggingProbabilities) ||
      !LEARNING_ARMS.includes(row.armId) ||
      !LEARNING_ARMS.every(
        (arm) =>
          Number.isFinite(row.predictions[arm]) &&
          Math.abs(row.predictions[arm]) <= 1,
      ) ||
      (row.loggedProbability != null &&
        (!Number.isFinite(row.loggedProbability) ||
          Math.abs(
            row.loggedProbability -
              (row.loggingProbabilities?.[row.armId] ?? NaN),
          ) > 1e-9)) ||
      !Number.isFinite(new Date(row.decisionAt).getTime())
    ) {
      reasons.push('invalid_contract');
      continue;
    }
    if (
      row.loggingProbabilities &&
      LEARNING_ARMS.some(
        (arm) =>
          row.candidateProbabilities[arm] > 0 &&
          row.loggingProbabilities?.[arm] === 0,
      )
    )
      reasons.push('unsupported_action');
    if (
      row.loggingProbabilities &&
      row.loggedProbability != null &&
      row.loggedProbability > 0 &&
      row.loggedProbability <= 1 &&
      Number.isFinite(row.reward) &&
      Math.abs(row.reward) <= 1
    )
      valid.push(row);
  }
  const weights = valid.map(
    (row) =>
      row.candidateProbabilities[row.armId] / (row.loggedProbability ?? 1),
  );
  const sum = weights.reduce((a, b) => a + b, 0),
    squared = weights.reduce((a, b) => a + b * b, 0),
    count = valid.length;
  const ips = count
    ? valid.reduce((total, row, i) => total + weights[i] * row.reward, 0) /
      count
    : 0;
  const snips = sum ? (ips * count) / sum : 0;
  const direct = count
    ? valid.reduce((total, row) => total + row.reward, 0) / count
    : 0;
  const doublyRobust = count
    ? valid.reduce(
        (total, row, i) =>
          total +
          LEARNING_ARMS.reduce(
            (v, arm) =>
              v + row.candidateProbabilities[arm] * row.predictions[arm],
            0,
          ) +
          weights[i] * (row.reward - row.predictions[row.armId]),
        0,
      ) / count
    : 0;
  const clippedSensitivity = count
    ? valid.reduce(
        (total, row, i) => total + Math.min(20, weights[i]) * row.reward,
        0,
      ) / count
    : 0;
  const ess = squared ? (sum * sum) / squared : 0;
  const observedArmCounts = Object.fromEntries(
    LEARNING_ARMS.map((arm) => [
      arm,
      valid.filter((row) => row.armId === arm).length,
    ]),
  );
  if (count < 100) reasons.push('insufficient_observations');
  if (ess < 50) reasons.push('low_ess');
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
  const sourceAccounts = [...new Set(valid.map((row) => row.accountGroup))];
  const blockKey = (row: LearningEvaluationRow) =>
    input.shared || sourceAccounts.length > 1
      ? row.accountGroup
      : String(Math.floor(new Date(row.decisionAt).getTime() / (7 * 86400000)));
  const groups = [...new Set(valid.map(blockKey))].sort();
  if (input.shared && sourceAccounts.length < 5)
    reasons.push('insufficient_accounts');
  if (input.synthetic) reasons.push('synthetic_evidence');
  if (input.differentialCensoring > 0.1) reasons.push('differential_censoring');
  if (input.semanticChange) reasons.push('semantic_change');
  const random = seeded(manifestHash),
    samples: number[] = [];
  const grouped = groups.map((group) =>
    valid.filter((row) => blockKey(row) === group),
  );
  for (let replicate = 0; replicate < 2000; replicate++) {
    let weighted = 0,
      denominator = 0;
    for (let j = 0; j < groups.length; j++)
      for (const row of grouped[Math.floor(random() * groups.length)]) {
        const weight =
          row.candidateProbabilities[row.armId] / (row.loggedProbability ?? 1);
        weighted += weight * row.reward;
        denominator += weight;
      }
    samples.push(denominator ? weighted / denominator : 0);
  }
  samples.sort((a, b) => a - b);
  return {
    status: reasons.some((reason) =>
      [
        'unsupported_action',
        'differential_censoring',
        'semantic_change',
        'invalid_contract',
      ].includes(reason),
    )
      ? 'failed'
      : reasons.length
        ? 'inconclusive'
        : 'passed',
    reasons: [...new Set(reasons)],
    count,
    excluded: rows.length - count,
    ips,
    snips,
    doublyRobust,
    direct,
    ess,
    clippedSensitivity,
    lower95: samples[49],
    upper95: samples[1949],
    bootstrapReplicates: 2000,
    observedArmCounts,
  };
}
