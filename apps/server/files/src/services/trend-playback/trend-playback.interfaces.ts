export interface TrendPlaybackRequest {
  /** The TikTok or Instagram page URL the trend scrape stored. */
  sourceUrl: string;
  /** The trend video's id, used to name the saved copy. */
  videoId: string;
}

export interface TrendPlaybackResult {
  playbackKey: string;
  playbackUrl: string;
  size: number;
}
