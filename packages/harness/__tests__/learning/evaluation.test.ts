import { describe, expect, it } from 'vitest';
import {
  evaluateLearningPolicy,
  type LearningEvaluationRow,
} from '../../src/learning/evaluation';
import { LEARNING_ARMS } from '../../src/learning/strategies';

const rows: LearningEvaluationRow[] = Array.from({ length: 180 }, (_, i) => ({
  accountGroup: `account-${i % 6}`,
  armId: LEARNING_ARMS[i % 3],
  reward: 0.5,
  loggedProbability: 1 / 3,
  loggingProbabilities: {
    'baseline-v1': 1 / 3,
    'question-example-v1': 1 / 3,
    'proof-steps-v1': 1 / 3,
  },
  candidateProbabilities: {
    'baseline-v1': 1 / 3,
    'question-example-v1': 1 / 3,
    'proof-steps-v1': 1 / 3,
  },
  predictions: {
    'baseline-v1': 0.2,
    'question-example-v1': 0.2,
    'proof-steps-v1': 0.2,
  },
  split: i % 2 ? 'temporal_holdout' : 'account_holdout',
  decisionAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
}));
const options = {
  shared: true,
  synthetic: false,
  differentialCensoring: 0,
  semanticChange: false,
};
describe('off-policy release gates', () => {
  it('reproduces account bootstrap and estimates known constant rewards', () => {
    const report = evaluateLearningPolicy(rows, 'manifest', options);
    expect(report.status).toBe('passed');
    expect(report.ips).toBeCloseTo(0.5);
    expect(report.snips).toBeCloseTo(0.5);
    expect(report.doublyRobust).toBeCloseTo(0.5);
    expect(report.ess).toBe(180);
    expect(report.bootstrapReplicates).toBe(2000);
    expect(evaluateLearningPolicy(rows, 'manifest', options)).toEqual(report);
  });
  it('blocks support on any candidate arm, even if that arm was not selected', () => {
    const unsupported = rows.map((row) => ({
      ...row,
      loggingProbabilities: {
        'baseline-v1': 1 / 3,
        'question-example-v1': 1 / 3,
        'proof-steps-v1': 0,
      },
    }));
    expect(
      evaluateLearningPolicy(unsupported, 'seed', options).reasons,
    ).toContain('unsupported_action');
  });
  it('never promotes synthetic, censored, sparse, or training-only evidence', () => {
    expect(
      evaluateLearningPolicy(rows, 'seed', { ...options, synthetic: true })
        .status,
    ).toBe('inconclusive');
    expect(
      evaluateLearningPolicy(rows, 'seed', {
        ...options,
        differentialCensoring: 0.11,
      }).status,
    ).toBe('failed');
    expect(
      evaluateLearningPolicy(
        rows.map((row) => ({ ...row, split: 'training' })),
        'seed',
        options,
      ).count,
    ).toBe(0);
  });
});
