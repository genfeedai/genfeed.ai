import type {
  LearningCellDescriptor,
  LearningFormat,
  LearningMetricName,
} from '@genfeedai/contracts';
export type RewardObjective =
  | 'awareness'
  | 'engagement'
  | 'authority-proxy'
  | 'conversion-click'
  | 'retention-watch';
export interface LearningCapability {
  exposureSource: string;
  mask: string;
  weights: Record<string, number>;
  retention: boolean;
}
const FORMATS: Record<string, string[]> = {
  twitter: ['text', 'image', 'video', 'thread'],
  instagram: ['image', 'carousel', 'video', 'short'],
  facebook: ['text', 'image', 'video'],
  threads: ['text', 'image', 'video'],
  linkedin: ['text', 'image', 'carousel', 'video'],
  pinterest: ['image', 'video'],
  tiktok: ['video', 'short'],
  youtube: ['video', 'short'],
};
const EXPOSURES: Record<string, string> = {
  twitter: 'views',
  instagram: 'reach',
  facebook: 'impressions',
  threads: 'views',
  linkedin: 'impressions',
  pinterest: 'impressions',
  tiktok: 'videoViews',
  youtube: 'videoViews',
};
export interface LearningRegisteredProfile {
  descriptor: LearningCellDescriptor;
  capability: LearningCapability;
}
export function learningDescriptorTuple(
  descriptor: LearningCellDescriptor,
): readonly unknown[] {
  return [
    descriptor.platform,
    descriptor.format,
    descriptor.objective,
    descriptor.exposureSource,
    descriptor.metricWeights,
    descriptor.retention,
    descriptor.windowId,
    descriptor.configVersion,
    descriptor.featureSchema,
    descriptor.armCatalogVersion,
  ];
}
export function learningRegisteredProfiles(
  platform: string,
  format: string,
  objective: RewardObjective,
): LearningRegisteredProfile[] {
  if (!FORMATS[platform]?.includes(format)) return [];
  const exposureSource =
    platform === 'twitter' && objective === 'engagement'
      ? 'impressions'
      : EXPOSURES[platform];
  const profiles: Array<{ weights: Record<string, number>; mask: string }> = [];
  if (objective === 'awareness') profiles.push({ weights: {}, mask: 'E' });
  else if (objective === 'engagement' && platform !== 'pinterest') {
    if (['twitter', 'instagram'].includes(platform))
      profiles.push({
        weights: { likes: 1, comments: 2, shares: 4, saves: 4 },
        mask: 'LCSS',
      });
    if (platform === 'youtube')
      profiles.push(
        { weights: { likes: 1, comments: 2, shares: 4 }, mask: 'LCS' },
        { weights: { likes: 1, comments: 2 }, mask: 'LC' },
      );
    else
      profiles.push({
        weights: { likes: 1, comments: 2, shares: 4 },
        mask: 'LCS',
      });
  } else if (objective === 'authority-proxy' && platform === 'instagram')
    profiles.push({ weights: { shares: 4, saves: 4 }, mask: 'shares+saves' });
  else if (objective === 'authority-proxy' && platform === 'pinterest')
    profiles.push({ weights: { saves: 4 }, mask: 'saves' });
  else if (
    objective === 'conversion-click' &&
    ['linkedin', 'pinterest'].includes(platform)
  )
    profiles.push({
      weights: { clicks: 4 },
      mask: platform === 'pinterest' ? 'outbound-click' : 'click',
    });
  else if (
    objective === 'retention-watch' &&
    ['youtube', 'tiktok'].includes(platform)
  )
    profiles.push({
      weights: { averageWatchTimeSeconds: 1 },
      mask: 'watch-seconds',
    });
  return profiles.map((profile) => ({
    descriptor: {
      platform,
      format: format as LearningFormat,
      objective,
      exposureSource: exposureSource as LearningMetricName,
      metricWeights: Object.entries(profile.weights)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([metric, weight]) => [metric as LearningMetricName, weight]),
      retention: objective === 'retention-watch',
      windowId: '48h-v1',
      configVersion: 'rl-reward-v1-experimental',
      featureSchema: 'numeric-nine-v1',
      armCatalogVersion: 'learning-arms-v1',
    },
    capability: {
      exposureSource,
      mask: profile.mask,
      weights: profile.weights,
      retention: objective === 'retention-watch',
    },
  }));
}
export function learningCapability(
  platform: string,
  format: string,
  objective: RewardObjective,
  available: readonly string[],
): LearningCapability | null {
  return (
    learningRegisteredProfiles(platform, format, objective).find(
      (profile) =>
        available.includes(profile.capability.exposureSource) &&
        Object.keys(profile.capability.weights).every((metric) =>
          available.includes(metric),
        ),
    )?.capability ?? null
  );
}
export function learningProfileSupported(
  profile: LearningRegisteredProfile,
  available: readonly string[],
): boolean {
  return (
    available.includes(profile.capability.exposureSource) &&
    Object.keys(profile.capability.weights).every((metric) =>
      available.includes(metric),
    )
  );
}
export function validLearningDescriptor(
  value: unknown,
): value is LearningCellDescriptor {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('platform' in value) ||
    !('format' in value) ||
    !('objective' in value) ||
    typeof value.platform !== 'string' ||
    typeof value.format !== 'string' ||
    typeof value.objective !== 'string'
  )
    return false;
  return learningRegisteredProfiles(
    value.platform,
    value.format,
    value.objective as RewardObjective,
  ).some(
    (profile) =>
      JSON.stringify(Object.keys(profile.descriptor).sort()) ===
        JSON.stringify(Object.keys(value).sort()) &&
      JSON.stringify(learningDescriptorTuple(profile.descriptor)) ===
        JSON.stringify(
          learningDescriptorTuple(value as LearningCellDescriptor),
        ),
  );
}
export function checkpointValidity(input: {
  publishedAt: Date;
  requestStartedAt: Date;
  receivedAt: Date;
  providerAsOf?: Date | null;
}): string | null {
  const age = input.requestStartedAt.getTime() - input.publishedAt.getTime();
  if (
    age < 48 * 3600000 ||
    input.receivedAt.getTime() - input.publishedAt.getTime() > 49 * 3600000
  )
    return 'missed_window';
  const duration =
    input.receivedAt.getTime() - input.requestStartedAt.getTime();
  if (duration < 0 || duration > 120000) return 'delayed';
  if (
    input.providerAsOf &&
    (input.providerAsOf > input.receivedAt ||
      input.requestStartedAt.getTime() - input.providerAsOf.getTime() > 3600000)
  )
    return 'delayed';
  return null;
}
