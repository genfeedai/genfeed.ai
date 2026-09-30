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
export function learningCapability(
  platform: string,
  format: string,
  objective: RewardObjective,
  available: readonly string[],
): LearningCapability | null {
  if (!FORMATS[platform]?.includes(format)) return null;
  const exposureSource =
    platform === 'twitter' && objective === 'engagement'
      ? 'impressions'
      : EXPOSURES[platform];
  if (!available.includes('exposure')) return null;
  if (objective === 'awareness' && platform !== 'pinterest')
    return { exposureSource, mask: 'E', weights: {}, retention: false };
  if (objective === 'awareness')
    return { exposureSource, mask: 'E', weights: {}, retention: false };
  let weights: Record<string, number>;
  if (objective === 'engagement' && platform !== 'pinterest') {
    weights =
      platform === 'youtube'
        ? { likes: 1, comments: 2 }
        : { likes: 1, comments: 2, shares: 4 };
    if (
      ['twitter', 'instagram'].includes(platform) &&
      available.includes('saves')
    )
      weights.saves = 4;
  } else if (objective === 'authority-proxy' && platform === 'instagram')
    weights = { shares: 4, saves: 4 };
  else if (objective === 'authority-proxy' && platform === 'pinterest')
    weights = { saves: 4 };
  else if (
    objective === 'conversion-click' &&
    ['linkedin', 'pinterest'].includes(platform)
  )
    weights = { clicks: 4 };
  else if (
    objective === 'retention-watch' &&
    ['tiktok', 'youtube'].includes(platform)
  )
    weights = { averageWatchTimeSeconds: 1 };
  else return null;
  if (Object.keys(weights).some((metric) => !available.includes(metric)))
    return null;
  const mask = Object.keys(weights)
    .map(
      (metric) =>
        ({
          likes: 'L',
          comments: 'C',
          shares: 'S',
          saves: 'S',
          clicks: 'outbound-click',
          averageWatchTimeSeconds: 'watch-seconds',
        })[metric],
    )
    .join('');
  return {
    exposureSource,
    mask,
    weights,
    retention: objective === 'retention-watch',
  };
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
