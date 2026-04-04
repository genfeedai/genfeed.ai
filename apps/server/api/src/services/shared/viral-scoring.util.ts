/**
 * Viral Scoring Utility
 *
 * Centralized calculations for viral scores and growth rates.
 * Used across Apify, trends, and analytics services.
 */

export interface VideoEngagementMetrics {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  hoursAgo?: number;
}

export interface ViralMetrics {
  viralScore: number;
  engagementRate: number;
  velocity: number;
}

export interface ContentMetrics {
  views: number;
  engagement: number;
}

/**
 * Viral Scoring Utility - consolidates viral score calculations
 */
export class ViralScoringUtil {
  /**
   * Calculate virality score based on views and engagement (simple formula).
   * Normalizes to 0-100 scale.
   *
   * Used for: hashtags, sounds, generic trends
   */
  static calculateViralityScore(views: number, engagement: number): number {
    const viewScore = Math.min(50, Math.log10(views + 1) * 10);
    const engagementScore = Math.min(50, Math.log10(engagement + 1) * 15);
    return Math.round(viewScore + engagementScore);
  }

  /**
   * Calculate viral score for videos using weighted formula.
   * Takes into account velocity (time-based growth).
   *
   * Used for: video content, trending videos
   */
  static calculateViralScore(
    viewCount: number,
    engagementRate: number,
    velocity: number,
  ): number {
    const viewScore = Math.min(40, Math.log10(viewCount + 1) * 8);
    const engagementScore = Math.min(30, engagementRate * 3);
    const velocityScore = Math.min(30, Math.log10(velocity + 1) * 10);
    return Math.round(viewScore + engagementScore + velocityScore);
  }

  /**
   * Calculate full engagement metrics for a video.
   * Returns viral score, engagement rate, and velocity.
   */
  static calculateVideoMetrics(metrics: VideoEngagementMetrics): ViralMetrics {
    const {
      viewCount,
      likeCount,
      commentCount,
      shareCount,
      hoursAgo = 24,
    } = metrics;

    // Calculate engagement rate (as percentage)
    const totalEngagement = likeCount + commentCount + shareCount;
    const engagementRate =
      viewCount > 0 ? (totalEngagement / viewCount) * 100 : 0;

    // Calculate velocity (views per hour)
    const velocity = hoursAgo > 0 ? viewCount / hoursAgo : viewCount;

    return {
      engagementRate: Math.round(engagementRate * 100) / 100,
      velocity: Math.round(velocity),
      viralScore: ViralScoringUtil.calculateViralScore(
        viewCount,
        engagementRate,
        velocity,
      ),
    };
  }

  /**
   * Calculate growth rate between two values.
   * Returns percentage growth.
   */
  static calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * Calculate rank-based virality score (for ranked lists).
   * Higher rank = higher virality.
   *
   * Used for: Twitter trends, ranked lists
   */
  static calculateRankViralityScore(rank: number, totalRanks = 20): number {
    const normalizedRank = Math.min(rank, totalRanks);
    return Math.round(100 - (normalizedRank - 1) * (100 / totalRanks));
  }

  /**
   * Normalize score to 0-100 range.
   */
  static normalizeScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
