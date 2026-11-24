export type PublicYoutubeOutlierTier = 'outlier' | 'breakout';

export type PublicYoutubeOutliersStatus =
  | 'insufficient_data'
  | 'ready'
  | 'zero_baseline';

export interface IPublicYoutubeOutlierVideo {
  readonly publishedAt: string;
  /** Views divided by the channel's typical views. */
  readonly ratio: number;
  readonly thumbnailUrl?: string;
  /** Null when the video is under the outlier threshold. */
  readonly tier: PublicYoutubeOutlierTier | null;
  readonly title: string;
  readonly url: string;
  readonly videoId: string;
  readonly views: number;
}

export interface IPublicYoutubeOutliersToolResult {
  /** Median views of the channel's latest matured videos. */
  readonly baselineViews: number | null;
  readonly baselineSampleSize: number;
  readonly breakoutThreshold: number;
  readonly channelId: string;
  readonly channelTitle?: string;
  readonly id: string;
  readonly outlierThreshold: number;
  readonly outliers: readonly IPublicYoutubeOutlierVideo[];
  readonly status: PublicYoutubeOutliersStatus;
  readonly videosAnalyzed: number;
}
