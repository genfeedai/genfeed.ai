export const LEARNING_FEATURE_SCHEMA = 'numeric-nine-v1';
export const LEARNING_FEATURE_COUNT = 9;
export const clamp = (value: number, low = -1, high = 1): number =>
  Math.min(high, Math.max(low, value));
export function learningFeatures(input: {
  followers?: number | null;
  baselineMedianExposure?: number | null;
  decisionAt: Date;
}): number[] {
  const scale = (value: number | null | undefined) =>
    value == null ? 0 : clamp(Math.log10(1 + Math.max(0, value)) / 6, 0, 1);
  const weekday = input.decisionAt.getUTCDay();
  const hour = input.decisionAt.getUTCHours();
  return [
    1,
    scale(input.followers),
    Number(input.followers == null),
    scale(input.baselineMedianExposure),
    Number(input.baselineMedianExposure == null),
    Math.sin((2 * Math.PI * weekday) / 7),
    Math.cos((2 * Math.PI * weekday) / 7),
    Math.sin((2 * Math.PI * hour) / 24),
    Math.cos((2 * Math.PI * hour) / 24),
  ];
}
export function assertLearningFeatures(features: readonly number[]): void {
  if (
    features.length !== 9 ||
    features.some((value) => !Number.isFinite(value))
  )
    throw new Error('invalid_feature_schema');
}
