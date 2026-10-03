import type { ScoreBand } from '../contracts';
import type { ScoreDistribution } from './contracts';
import type { Band, KappaWeighting } from './types';

export function roundMetric(_value: number): number {
  return 0;
}

export function averageRanks(_values: readonly number[]): number[] {
  return [];
}

export function spearmanRho(
  _x: readonly number[],
  _y: readonly number[],
): number | null {
  return null;
}

export function cohensKappa(
  _pairs: ReadonlyArray<readonly [number, number]>,
  _categories: number,
  _weighting: KappaWeighting,
): number | null {
  return null;
}

export function bandFromCuts(
  _value: number,
  _cuts: readonly [number, number, number],
): Band {
  return 0;
}

export function humanBand(_scoreBand: ScoreBand): Band {
  return 0;
}

export function bandMidpoint(_scoreBand: ScoreBand): number {
  return 0;
}

export function meanAbsoluteError(
  _predicted: readonly number[],
  _actual: readonly number[],
): number | null {
  return null;
}

export function scoreDistribution(
  _scored: ReadonlyArray<{ band: Band; normalizedScore: number }>,
): ScoreDistribution {
  return {
    bandCounts: [0, 0, 0, 0],
    ceilingRate: 0,
    dominantBandShare: 0,
    floorRate: 0,
    isCompressed: false,
    mean: 0,
    standardDeviation: 0,
  };
}
