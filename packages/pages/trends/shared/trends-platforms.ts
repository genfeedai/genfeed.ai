import type { TrendItem } from '@props/trends/trends-page.props';

export const REALTIME_TREND_PLATFORMS = [
  'tiktok',
  'instagram',
  'twitter',
  'youtube',
  'reddit',
  'pinterest',
] as const;

export const CURATED_TREND_PLATFORMS = ['linkedin'] as const;

export const ALL_TREND_PLATFORMS = [
  ...REALTIME_TREND_PLATFORMS,
  ...CURATED_TREND_PLATFORMS,
] as const;

export type TrendPlatform = (typeof ALL_TREND_PLATFORMS)[number];
export type RealtimeTrendPlatform = (typeof REALTIME_TREND_PLATFORMS)[number];

export const TREND_PLATFORM_LABELS: Record<TrendPlatform, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

export const PLATFORM_RELATED_CONTENT: Record<
  TrendPlatform,
  {
    hashtags: boolean;
    sounds: boolean;
    videos: boolean;
  }
> = {
  instagram: { hashtags: true, sounds: false, videos: true },
  linkedin: { hashtags: false, sounds: false, videos: false },
  pinterest: { hashtags: false, sounds: false, videos: false },
  reddit: { hashtags: false, sounds: false, videos: true },
  tiktok: { hashtags: true, sounds: true, videos: true },
  twitter: { hashtags: true, sounds: false, videos: false },
  youtube: { hashtags: false, sounds: false, videos: true },
};

export function isTrendPlatform(value: string): value is TrendPlatform {
  return (ALL_TREND_PLATFORMS as readonly string[]).includes(value);
}

export function getTrendPlatformLabel(platform: TrendPlatform): string {
  return TREND_PLATFORM_LABELS[platform];
}

export function getNewestTrendByCreatedAt(
  trends: TrendItem[],
): TrendItem | null {
  return trends.reduce<TrendItem | null>((newestTrend, trend) => {
    if (!trend.createdAt) {
      return newestTrend;
    }

    if (!newestTrend?.createdAt) {
      return trend;
    }

    return new Date(trend.createdAt) > new Date(newestTrend.createdAt)
      ? trend
      : newestTrend;
  }, null);
}
