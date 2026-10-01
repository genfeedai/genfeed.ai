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
  it('reports absent logging distributions as excluded while failing overflowing finite propensities', () => {
    const absent = {
      ...rows[0],
      loggingProbabilities: null,
      loggedProbability: null,
    };
    expect(
      evaluateLearningPolicy([...rows, absent], 'seed', options).status,
    ).toBe('passed');
    expect(
      evaluateLearningPolicy([...rows, absent], 'seed', options).excluded,
    ).toBe(1);
    const overflow = {
      ...rows[0],
      loggedProbability: 1e-320,
      loggingProbabilities: {
        'baseline-v1': 1e-320,
        'question-example-v1': 0.5,
        'proof-steps-v1': 0.5,
      },
    };
    const report = evaluateLearningPolicy([...rows, overflow], 'seed', options);
    expect(report.status).toBe('inconclusive');
    expect(report.reasons).toContain('numerical_instability');
    expect(report.ips.value).toBeNull();
    expect(report.ess).toBeNull();
  });
  it('blocks unnormalized distributions, inconsistent scalar propensity and nonfinite predictions', () => {
    const malformed = [
      {
        ...rows[0],
        candidateProbabilities: {
          'baseline-v1': 2 / 3,
          'question-example-v1': 2 / 3,
          'proof-steps-v1': 2 / 3,
        },
      },
      { ...rows[0], loggedProbability: 0.5 },
      {
        ...rows[0],
        predictions: {
          'baseline-v1': Infinity,
          'question-example-v1': 0.2,
          'proof-steps-v1': 0.2,
        },
      },
    ];
    for (const row of malformed)
      expect(
        evaluateLearningPolicy([row, ...rows.slice(1)], 'seed', options).status,
      ).toBe('failed');
  });
  it('excluded descriptive rows never create a false support failure', () => {
    expect(
      evaluateLearningPolicy(
        [
          ...rows,
          {
            ...rows[0],
            split: 'excluded',
            loggingProbabilities: {
              'baseline-v1': 1,
              'question-example-v1': 0,
              'proof-steps-v1': 0,
            },
          },
        ],
        'seed',
        options,
      ).status,
    ).toBe('passed');
  });
  it('reproduces account bootstrap and estimates known constant rewards', () => {
    const report = evaluateLearningPolicy(rows, 'manifest', options);
    expect(report.status).toBe('passed');
    expect(report.ips.value).toBeCloseTo(0.5);
    expect(report.snips.value).toBeCloseTo(0.5);
    expect(report.doublyRobust.value).toBeCloseTo(0.5);
    expect(report.ess).toBe(180);
    expect(report.bootstrapReplicates).toBe(2000);
    expect(evaluateLearningPolicy(rows, 'manifest', options)).toEqual(report);
  });
  it('blocks support on any candidate arm, even if that arm was not selected', () => {
    const unsupported = rows.map((row) => ({
      ...row,
      loggedProbability:
        row.armId === 'baseline-v1'
          ? 2 / 3
          : row.armId === 'question-example-v1'
            ? 1 / 3
            : 0,
      loggingProbabilities: {
        'baseline-v1': 2 / 3,
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
