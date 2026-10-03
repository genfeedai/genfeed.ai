import { describe, expect, it } from 'vitest';
import {
  bandFromCuts,
  bandMidpoint,
  cohensKappa,
  humanBand,
  meanAbsoluteError,
  scoreDistribution,
  spearmanRho,
} from './statistics';
import type { KappaWeighting } from './types';

describe('spearmanRho', () => {
  it('SV-1: correlates average ranks with tied values', () => {
    expect(spearmanRho([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])).toBe(0.8208);
  });

  it('SV-2: is null for a constant series or one observation', () => {
    expect(spearmanRho([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(spearmanRho([1], [5])).toBeNull();
  });
});

describe('cohensKappa', () => {
  it.each<[KappaWeighting, number]>([
    ['quadratic', 0.8667],
    ['unweighted', 0.5714],
  ])('KV-1: gives kappa %s = %s', (weighting, expected) => {
    expect(
      cohensKappa(
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [3, 3],
          [0, 1],
          [3, 2],
        ],
        4,
        weighting,
      ),
    ).toBe(expected);
  });

  it('KV-2: gives decision kappa 0.6 with four disagreements', () => {
    expect(
      cohensKappa(
        [
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
          [1, 0],
          [1, 0],
          [0, 1],
          [0, 1],
        ],
        2,
        'unweighted',
      ),
    ).toBe(0.6);
  });

  it('KV-3: is null when every pair is in the same band', () => {
    const pairs: Array<readonly [number, number]> = [
      [2, 2],
      [2, 2],
      [2, 2],
    ];

    expect(cohensKappa(pairs, 4, 'quadratic')).toBeNull();
    expect(cohensKappa(pairs, 4, 'unweighted')).toBeNull();
  });
});

describe('meanAbsoluteError', () => {
  it('MV-1: measures error against human band midpoints', () => {
    expect(meanAbsoluteError([0.2, 0.9], [0.125, 0.875])).toBe(0.05);
  });
});

describe('bandFromCuts', () => {
  it('maps scorer scores at each native cut', () => {
    expect(
      [3.9, 4, 5.99, 6, 8, 10].map((score) => bandFromCuts(score, [4, 6, 8])),
    ).toEqual([0, 1, 1, 2, 3, 3]);
  });

  it('maps evaluations scores at each native cut', () => {
    expect(
      [24, 25, 74.5, 75, 100].map((score) => bandFromCuts(score, [25, 50, 75])),
    ).toEqual([0, 1, 2, 3, 3]);
  });
});

describe('human bands', () => {
  it('maps each golden band lower bound to its ordinal band', () => {
    expect(
      [0, 0.25, 0.5, 0.75].map((min) => humanBand({ max: min + 0.25, min })),
    ).toEqual([0, 1, 2, 3]);
  });

  it('uses the midpoint of each golden band as the human point score', () => {
    expect(
      [0, 0.25, 0.5, 0.75].map((min) => bandMidpoint({ max: min + 0.25, min })),
    ).toEqual([0.125, 0.375, 0.625, 0.875]);
  });
});

describe('scoreDistribution', () => {
  it('reports the population spread and compression of the scored bands', () => {
    expect(
      scoreDistribution([
        { band: 3, normalizedScore: 0.9 },
        { band: 3, normalizedScore: 0.9 },
        { band: 3, normalizedScore: 0.9 },
        { band: 3, normalizedScore: 0.9 },
        { band: 2, normalizedScore: 0.6 },
      ]),
    ).toEqual({
      bandCounts: [0, 0, 1, 4],
      ceilingRate: 0.8,
      dominantBandShare: 0.8,
      floorRate: 0,
      isCompressed: true,
      mean: 0.84,
      standardDeviation: 0.12,
    });
  });
});
