/**
 * `GET /analytics/hooks` response (`AnalyticsHooksSerializer`: `videos` +
 * `analysis`). Produced by `AnalyticsResponseProjection.buildViralHooks`: a
 * post's hook is the opening line/sentence of its description, and every
 * metric is summed from `post_analytics` over the requested date range.
 */
export interface IViralHookVideo {
  id: string;
  title: string;
  description: string;
  /** Opening line/sentence of the description; empty when it has none. */
  hook: string;
  platforms: string[];
  totalEngagement: number;
  totalViews: number;
}

/** Posts grouped by their normalized (lowercased, trimmed) hook text. */
export interface IViralHookEffectiveness {
  hook: string;
  avgEngagement: number;
  avgViews: number;
  postCount: number;
}

export interface IViralTopHook {
  hook: string;
  avgEngagement: number;
  postCount: number;
}

export interface IViralHookPlatformSummary {
  platform: string;
  postCount: number;
  totalEngagement: number;
  totalViews: number;
}

export interface IViralHookAnalysis {
  totalVideos: number;
  topPlatforms: IViralHookPlatformSummary[];
  hookEffectiveness: IViralHookEffectiveness[];
  topHooks: IViralTopHook[];
}

export interface IViralHooksResult {
  videos: IViralHookVideo[];
  analysis: IViralHookAnalysis;
}
