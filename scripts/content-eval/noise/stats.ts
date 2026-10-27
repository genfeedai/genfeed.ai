/** Small-sample interval math for the noise section; no dependencies. */

import type { NoiseEstimate } from './contracts';

/** Two-sided 95% Student-t critical values by degrees of freedom. */
const T_95: ReadonlyArray<readonly [number, number]> = [
  [1, 12.706],
  [2, 4.303],
  [3, 3.182],
  [4, 2.776],
  [5, 2.571],
  [6, 2.447],
  [7, 2.365],
  [8, 2.306],
  [9, 2.262],
  [10, 2.228],
  [12, 2.179],
  [15, 2.131],
  [20, 2.086],
  [25, 2.06],
  [30, 2.042],
  [40, 2.021],
  [60, 2.0],
  [120, 1.98],
];
const NORMAL_95 = 1.96;

/** Rounds df down to the nearest tabulated value, which only widens the interval. */
export function tCritical95(degreesOfFreedom: number): number {
  if (degreesOfFreedom < 1) {
    return Number.POSITIVE_INFINITY;
  }
  let critical: number = NORMAL_95;
  for (const [df, value] of T_95) {
    if (degreesOfFreedom >= df) {
      critical = value;
    } else {
      break;
    }
  }

  return critical;
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation; null below two values. */
export function sampleSd(values: readonly number[]): number | null {
  const average = mean(values);
  if (average === null || values.length < 2) {
    return null;
  }

  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
}

/** Mean with a 95% t-interval over independent cases. */
export function estimate(values: readonly number[]): NoiseEstimate {
  const average = mean(values);
  const sd = sampleSd(values);
  if (average === null || sd === null) {
    return { ci95: null, halfWidth: null, mean: average, n: values.length, sd };
  }

  const halfWidth =
    tCritical95(values.length - 1) * (sd / Math.sqrt(values.length));

  return {
    ci95: { lower: average - halfWidth, upper: average + halfWidth },
    halfWidth,
    mean: average,
    n: values.length,
    sd,
  };
}

/**
 * Pooled within-group standard deviation (groups of repeats of one case).
 * Groups with a single value carry no information about repeat variance.
 */
export function pooledSd(
  groups: ReadonlyArray<readonly number[]>,
): number | null {
  let sumSquares = 0;
  let degreesOfFreedom = 0;
  for (const group of groups) {
    const average = mean(group);
    if (average === null || group.length < 2) {
      continue;
    }
    sumSquares += group.reduce((sum, value) => sum + (value - average) ** 2, 0);
    degreesOfFreedom += group.length - 1;
  }

  return degreesOfFreedom === 0
    ? null
    : Math.sqrt(sumSquares / degreesOfFreedom);
}
