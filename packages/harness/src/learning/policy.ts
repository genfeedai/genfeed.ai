import { assertLearningFeatures, clamp } from './features';
import { LEARNING_ARMS, type LearningArmId } from './strategies';
export interface LearningArmState {
  a: number[][];
  b: number[];
}
export type LearningPolicyState = Record<LearningArmId, LearningArmState>;
export function initializeLearningPolicy(
  shared?: Partial<Record<LearningArmId, number[]>>,
  prior = 20,
): LearningPolicyState {
  return Object.fromEntries(
    LEARNING_ARMS.map((arm) => [
      arm,
      {
        a: Array.from({ length: 9 }, (_, i) =>
          Array.from({ length: 9 }, (_, j) => (i === j ? prior : 0)),
        ),
        b: Array.from(
          { length: 9 },
          (_, i) => prior * (shared?.[arm]?.[i] ?? 0),
        ),
      },
    ]),
  ) as LearningPolicyState;
}
export function solveLearningRidge(state: LearningArmState): number[] {
  assertLearningFeatures(state.b);
  if (
    state.a.length !== 9 ||
    state.a.some(
      (row) => row.length !== 9 || row.some((value) => !Number.isFinite(value)),
    )
  )
    throw new Error('nonfinite_policy');
  const l = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
  for (let i = 0; i < 9; i++)
    for (let j = 0; j <= i; j++) {
      if (Math.abs(state.a[i][j] - state.a[j][i]) > 1e-9)
        throw new Error('nonsymmetric_policy');
      let sum = state.a[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j && sum <= 0) throw new Error('non_positive_definite_policy');
      l[i][j] = i === j ? Math.sqrt(sum) : sum / l[j][j];
    }
  const y = Array<number>(9).fill(0),
    theta = Array<number>(9).fill(0);
  for (let i = 0; i < 9; i++) {
    let v = state.b[i];
    for (let j = 0; j < i; j++) v -= l[i][j] * y[j];
    y[i] = v / l[i][i];
  }
  for (let i = 8; i >= 0; i--) {
    let v = y[i];
    for (let j = i + 1; j < 9; j++) v -= l[j][i] * theta[j];
    theta[i] = v / l[i][i];
  }
  if (theta.some((value) => !Number.isFinite(value)))
    throw new Error('nonfinite_policy');
  return theta;
}
export function updateLearningPolicy(
  state: LearningPolicyState,
  arm: LearningArmId,
  x: readonly number[],
  reward: number,
  weight = 1,
): void {
  assertLearningFeatures(x);
  if (
    !Number.isFinite(reward) ||
    Math.abs(reward) > 1 ||
    !Number.isFinite(weight) ||
    weight <= 0
  )
    throw new Error('invalid_reward');
  for (let i = 0; i < 9; i++) {
    state[arm].b[i] += weight * x[i] * reward;
    for (let j = 0; j < 9; j++) state[arm].a[i][j] += weight * x[i] * x[j];
  }
}
export function learningProbabilities(
  state: LearningPolicyState,
  x: readonly number[],
  eligible: readonly LearningArmId[],
): Record<LearningArmId, number> {
  assertLearningFeatures(x);
  if (
    !eligible.includes('baseline-v1') ||
    new Set(eligible).size !== eligible.length
  )
    throw new Error('invalid_eligible_arms');
  let greedy: LearningArmId = 'baseline-v1',
    best = -Infinity;
  for (const arm of [...eligible].sort()) {
    const theta = solveLearningRidge(state[arm]);
    const score = clamp(theta.reduce((sum, value, i) => sum + value * x[i], 0));
    if (score > best) {
      greedy = arm;
      best = score;
    }
  }
  return Object.fromEntries(
    LEARNING_ARMS.map((arm) => [
      arm,
      eligible.includes(arm)
        ? 0.05 / eligible.length + (arm === greedy ? 0.95 : 0)
        : 0,
    ]),
  ) as Record<LearningArmId, number>;
}
export function sampleLearningArm(
  probabilities: Record<LearningArmId, number>,
  random: number,
): LearningArmId {
  if (
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1 ||
    Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 1e-9
  )
    throw new Error('invalid_distribution');
  let cumulative = 0;
  for (const arm of LEARNING_ARMS) {
    if (probabilities[arm] < 0 || !Number.isFinite(probabilities[arm]))
      throw new Error('invalid_distribution');
    cumulative += probabilities[arm];
    if (random < cumulative) return arm;
  }
  throw new Error('invalid_distribution');
}
