import type { LearningCapability, RewardObjective } from './capabilities';
import { clamp } from './features';
export interface LearningMeasurement {
  exposure: number;
  weightedActions: number;
  averageWatchTimeSeconds?: number;
}
export interface LearningRewardResult {
  status: string;
  composite?: number;
  quality?: number;
  distribution?: number;
  rawQuality?: number;
  shrunkQuality?: number;
  medianExposure: number;
  exposureRatio?: number;
  ratioReason?: string;
  baselineCount: number;
}
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}
export function midrank(value: number, sample: readonly number[]): number {
  if (!sample.length) throw new Error('empty_baseline');
  return (
    (sample.filter((v) => v < value).length +
      0.5 * sample.filter((v) => v === value).length) /
    sample.length
  );
}
export function weightedMeasurement(
  exposure: number,
  values: Record<string, number>,
  capability: LearningCapability,
): LearningMeasurement {
  if (!Number.isFinite(exposure) || exposure < 0)
    throw new Error('invalid_measurement');
  let weightedActions = 0;
  for (const [key, weight] of Object.entries(capability.weights)) {
    const value = values[key];
    if (!Number.isFinite(value) || value < 0)
      throw new Error('unsupported_metric');
    weightedActions += value * weight;
  }
  return {
    exposure,
    weightedActions,
    averageWatchTimeSeconds: capability.retention
      ? values.averageWatchTimeSeconds
      : undefined,
  };
}
export function computeLearningReward(
  measurement: LearningMeasurement,
  baseline: readonly LearningMeasurement[],
  objective: RewardObjective,
): LearningRewardResult {
  const medianExposure = median(baseline.map((row) => row.exposure));
  const summary = {
    medianExposure,
    baselineCount: baseline.length,
    exposureRatio:
      medianExposure > 0 ? measurement.exposure / medianExposure : undefined,
    ratioReason: medianExposure > 0 ? undefined : 'zero_baseline',
  };
  if (baseline.length < 20)
    return { ...summary, status: 'insufficient_baseline' };
  if (
    [measurement, ...baseline].some(
      (row) =>
        !Number.isFinite(row.exposure) ||
        row.exposure < 0 ||
        !Number.isFinite(row.weightedActions) ||
        row.weightedActions < 0,
    )
  )
    return { ...summary, status: 'unsupported_metric' };
  const distribution = clamp(
    2 *
      midrank(
        Math.log1p(measurement.exposure),
        baseline.map((row) => Math.log1p(row.exposure)),
      ) -
      1,
  );
  if (measurement.exposure < 100)
    return { ...summary, distribution, status: 'low_exposure' };
  if (objective === 'awareness')
    return {
      ...summary,
      distribution,
      composite: distribution,
      status: 'valid',
    };
  const retention = objective === 'retention-watch';
  if (
    retention &&
    [measurement, ...baseline].some(
      (row) =>
        row.averageWatchTimeSeconds == null ||
        !Number.isFinite(row.averageWatchTimeSeconds) ||
        row.averageWatchTimeSeconds < 0,
    )
  )
    return { ...summary, status: 'unsupported_metric' };
  const raw = (row: LearningMeasurement) =>
    retention
      ? (row.averageWatchTimeSeconds ?? 0)
      : row.exposure > 0
        ? row.weightedActions / row.exposure
        : 0;
  const m = median(baseline.map(raw));
  const shrink = (row: LearningMeasurement) =>
    retention
      ? (row.exposure * raw(row) + 100 * m) / (row.exposure + 100)
      : (row.weightedActions + 100 * m) / (row.exposure + 100);
  const quality = clamp(
    2 * midrank(shrink(measurement), baseline.map(shrink)) - 1,
  );
  const qualityWeight = objective === 'engagement' ? 0.7 : 0.8;
  return {
    ...summary,
    rawQuality: raw(measurement),
    shrunkQuality: shrink(measurement),
    distribution,
    quality,
    composite: clamp(
      qualityWeight * quality + (1 - qualityWeight) * distribution,
    ),
    status: 'valid',
  };
}
