import type { ScoreBand } from '../contracts';
import type { ScoreDistribution } from './contracts';
import type { Band, KappaWeighting } from './types';

export function roundMetric(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function averageRanks(values: readonly number[]): number[] {
  const sorted = values
    .map((value, index) => ({ index, value }))
    .sort(
      (left, right) => left.value - right.value || left.index - right.index,
    );
  const ranks = Array.from(values, () => 0);

  let start = 0;
  while (start < sorted.length) {
    const first = sorted[start];
    if (!first) {
      break;
    }
    let end = start + 1;
    while (end < sorted.length && sorted[end]?.value === first.value) {
      end += 1;
    }
    const rank = (start + 1 + end) / 2;
    for (const entry of sorted.slice(start, end)) {
      ranks[entry.index] = rank;
    }
    start = end;
  }

  return ranks;
}

export function spearmanRho(
  x: readonly number[],
  y: readonly number[],
): number | null {
  if (x.length < 2 || x.length !== y.length) {
    return null;
  }
  const ranksX = averageRanks(x);
  const ranksY = averageRanks(y);
  const meanX = ranksX.reduce((sum, rank) => sum + rank, 0) / x.length;
  const meanY = ranksY.reduce((sum, rank) => sum + rank, 0) / y.length;
  let crossProduct = 0;
  let sumSquaresX = 0;
  let sumSquaresY = 0;
  for (const [index, rankX] of ranksX.entries()) {
    const dx = rankX - meanX;
    const dy = (ranksY[index] ?? 0) - meanY;
    crossProduct += dx * dy;
    sumSquaresX += dx * dx;
    sumSquaresY += dy * dy;
  }
  if (sumSquaresX === 0 || sumSquaresY === 0) {
    return null;
  }

  return roundMetric(crossProduct / Math.sqrt(sumSquaresX * sumSquaresY));
}

export function cohensKappa(
  pairs: ReadonlyArray<readonly [number, number]>,
  categories: number,
  weighting: KappaWeighting,
): number | null {
  if (pairs.length === 0) {
    return null;
  }
  const counts = Array.from({ length: categories * categories }, () => 0);
  const countsA = Array.from({ length: categories }, () => 0);
  const countsB = Array.from({ length: categories }, () => 0);
  for (const [a, b] of pairs) {
    const index = a * categories + b;
    counts[index] = (counts[index] ?? 0) + 1;
    countsA[a] = (countsA[a] ?? 0) + 1;
    countsB[b] = (countsB[b] ?? 0) + 1;
  }

  let observed = 0;
  let expected = 0;
  for (let a = 0; a < categories; a += 1) {
    for (let b = 0; b < categories; b += 1) {
      const weight =
        weighting === 'quadratic'
          ? 1 - (a - b) ** 2 / (categories - 1) ** 2
          : a === b
            ? 1
            : 0;
      observed += weight * ((counts[a * categories + b] ?? 0) / pairs.length);
      expected +=
        weight *
        ((countsA[a] ?? 0) / pairs.length) *
        ((countsB[b] ?? 0) / pairs.length);
    }
  }
  if (Math.abs(1 - expected) < 1e-12) {
    return null;
  }

  return roundMetric((observed - expected) / (1 - expected));
}

export function bandFromCuts(
  value: number,
  cuts: readonly [number, number, number],
): Band {
  let band: Band = 0;
  for (const cut of cuts) {
    if (value >= cut) {
      band = band === 0 ? 1 : band === 1 ? 2 : 3;
    }
  }

  return band;
}

export function humanBand(scoreBand: ScoreBand): Band {
  const band = Math.min(3, Math.floor(scoreBand.min * 4 + 1e-9));
  return band === 0 ? 0 : band === 1 ? 1 : band === 2 ? 2 : 3;
}

export function bandMidpoint(scoreBand: ScoreBand): number {
  return roundMetric((scoreBand.min + scoreBand.max) / 2);
}

export function meanAbsoluteError(
  predicted: readonly number[],
  actual: readonly number[],
): number | null {
  if (predicted.length === 0) {
    return null;
  }
  const total = predicted.reduce(
    (sum, value, index) => sum + Math.abs(value - (actual[index] ?? 0)),
    0,
  );

  return roundMetric(total / predicted.length);
}

export function scoreDistribution(
  scored: ReadonlyArray<{ band: Band; normalizedScore: number }>,
): ScoreDistribution {
  const bandCounts: ScoreDistribution['bandCounts'] = [0, 0, 0, 0];
  if (scored.length === 0) {
    return {
      bandCounts,
      ceilingRate: null,
      dominantBandShare: null,
      floorRate: null,
      isCompressed: false,
      mean: null,
      standardDeviation: null,
    };
  }
  let total = 0;
  for (const { band, normalizedScore } of scored) {
    bandCounts[band] += 1;
    total += normalizedScore;
  }
  const mean = total / scored.length;
  const variance =
    scored.reduce(
      (sum, { normalizedScore }) => sum + (normalizedScore - mean) ** 2,
      0,
    ) / scored.length;
  const dominantBandShare = roundMetric(
    Math.max(...bandCounts) / scored.length,
  );

  return {
    bandCounts,
    ceilingRate: roundMetric(bandCounts[3] / scored.length),
    dominantBandShare,
    floorRate: roundMetric(bandCounts[0] / scored.length),
    isCompressed: dominantBandShare >= 0.8,
    mean: roundMetric(mean),
    standardDeviation: roundMetric(Math.sqrt(variance)),
  };
}
