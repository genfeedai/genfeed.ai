/**
 * Where a performance row comes from: content Genfeed published, or a post
 * the brand published outside Genfeed and imported through its connected
 * own-account social source.
 */
export type PerformanceContentOrigin = 'genfeed' | 'imported';

/**
 * How much a weekly summary window can be trusted. Backed by the total
 * distinct posts (Genfeed + imported) folded into the window.
 */
export type PerformanceDatasetConfidence = 'none' | 'low' | 'medium' | 'high';

/** Counts backing a weekly performance summary window, split by origin. */
export interface IPerformanceDataset {
  genfeedPosts: number;
  importedPosts: number;
  totalPosts: number;
  confidence: PerformanceDatasetConfidence;
}

export interface IPerformanceContentItem {
  /**
   * Stable identity for this row. `postId` is not one: Genfeed rows come from
   * `PostAnalytics`, unique on `[postId, platform, date]`, so a post published
   * to two platforms — or measured on two days of the same window — yields
   * several rows sharing a `postId`.
   */
  id: string;
  /** Genfeed post id, or the source post id for imported content. */
  postId: string;
  origin: PerformanceContentOrigin;
  /** Set for imported content so consumers can reach the `SourcePost` row. */
  sourcePostId?: string;
  title: string;
  description: string;
  platform: string;
  engagementRate: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  publishDate?: string;
}

export interface IPlatformEngagement {
  platform: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface IContentTypeEngagement {
  category: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface IPostingTimeAnalysis {
  hour: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface IWeekOverWeekTrend {
  direction: 'up' | 'down' | 'stable';
  percentageChange: number;
  currentEngagement: number;
  previousEngagement: number;
}

export interface IWeeklyPerformanceSummary {
  /** How much content backs this window, split by origin. */
  dataset: IPerformanceDataset;
  topPerformers: IPerformanceContentItem[];
  worstPerformers: IPerformanceContentItem[];
  avgEngagementByPlatform: IPlatformEngagement[];
  avgEngagementByContentType: IContentTypeEngagement[];
  bestPostingTimes: IPostingTimeAnalysis[];
  topHooks: string[];
  weekOverWeekTrend: IWeekOverWeekTrend;
}
