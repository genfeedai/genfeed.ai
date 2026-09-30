import { describe, expect, it } from 'vitest';
import { learningFeatures } from '../../src/learning/features';
import {
  initializeLearningPolicy,
  learningProbabilities,
  sampleLearningArm,
  solveLearningRidge,
  updateLearningPolicy,
} from '../../src/learning/policy';
import { LEARNING_ARMS } from '../../src/learning/strategies';

describe('ridge epsilon replay', () => {
  const features = learningFeatures({
    decisionAt: new Date('2026-09-30T12:00:00Z'),
    followers: 1000,
    baselineMedianExposure: 1000,
  });
  it('learns from sixty fixed decisions and exactly reproduces replay', () => {
    const first = initializeLearningPolicy(),
      second = initializeLearningPolicy();
    for (let i = 0; i < 60; i++) {
      const arm = LEARNING_ARMS[i % 3];
      const reward = arm === 'proof-steps-v1' ? 0.8 : -0.5;
      updateLearningPolicy(first, arm, features, reward);
      updateLearningPolicy(second, arm, features, reward);
    }
    expect(first).toEqual(second);
    const probabilities = learningProbabilities(first, features, LEARNING_ARMS);
    expect(probabilities['proof-steps-v1']).toBeCloseTo(0.95 + 0.05 / 3);
    expect(Object.values(probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(
      1,
    );
    expect(sampleLearningArm(probabilities, 0.99)).toBe('proof-steps-v1');
  });
  it('falls back at the caller boundary for corrupted or nonsymmetric policy matrices', () => {
    const state = initializeLearningPolicy();
    state['baseline-v1'].a[0][0] = -1;
    expect(() => solveLearningRidge(state['baseline-v1'])).toThrow(
      'non_positive_definite_policy',
    );
  });
  it('has exactly nine numeric privacy-preserving fields and baseline-only probability one', () => {
    expect(features).toHaveLength(9);
    expect(features.every(Number.isFinite)).toBe(true);
    expect(
      learningFeatures({ decisionAt: new Date('2026-09-30T12:00:00Z') }).slice(
        1,
        5,
      ),
    ).toEqual([0, 1, 0, 1]);
    expect(
      learningProbabilities(initializeLearningPolicy(), features, [
        'baseline-v1',
      ])['baseline-v1'],
    ).toBe(1);
  });
});
