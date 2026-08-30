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

function calibratedLogScore(
  value: number,
  maxScore: number,
  logCeiling: number,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return maxScore * Math.min(1, Math.log10(value + 1) / logCeiling);
}

function calibratedLinearScore(
  value: number,
  maxScore: number,
  ceiling: number,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return maxScore * Math.min(1, value / ceiling);
}

/**
 * Calculate virality from reach and absolute engagement.
 *
 * Both signals keep fixed weights so adding engagement can never lower a
 * trend's score. The ceilings represent 100M reach and 10M engagements.
 */
function calculateViralityScore(views: number, engagement: number): number {
  const viewScore = calibratedLogScore(views, 50, 8);
  const engagementScore = calibratedLogScore(engagement, 50, 7);
  return Math.round(viewScore + engagementScore);
}

/**
 * Calculate video virality from reach, engagement rate, and hourly velocity.
 *
 * Reach and velocity use heavy-tail logarithmic curves up to 100M views and
 * 1M views/hour. A 25% engagement rate receives the full quality weight.
 */
function calculateViralScore(
  viewCount: number,
  engagementRate: number,
  velocity: number,
): number {
  const viewScore = calibratedLogScore(viewCount, 40, 8);
  const engagementScore = calibratedLinearScore(engagementRate, 30, 25);
  const velocityScore = calibratedLogScore(velocity, 30, 6);
  return Math.round(viewScore + engagementScore + velocityScore);
}

function calculateVideoMetrics(metrics: VideoEngagementMetrics): ViralMetrics {
  const {
    viewCount,
    likeCount,
    commentCount,
    shareCount,
    hoursAgo = 24,
  } = metrics;
  const totalEngagement = likeCount + commentCount + shareCount;
  const engagementRate =
    viewCount > 0 ? (totalEngagement / viewCount) * 100 : 0;
  const velocity = hoursAgo > 0 ? viewCount / hoursAgo : 0;

  return {
    engagementRate: Math.round(engagementRate * 100) / 100,
    velocity: Math.round(velocity),
    viralScore: calculateViralScore(viewCount, engagementRate, velocity),
  };
}

function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function calculateRankViralityScore(rank: number, totalRanks = 20): number {
  const normalizedRank = Math.min(Math.max(rank, 1), totalRanks);
  return Math.round(100 - (normalizedRank - 1) * (100 / totalRanks));
}

function normalizeScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Shared viral score calculations for Apify ingestion and API consumers. */
export const ViralScoringUtil = {
  calculateGrowthRate,
  calculateRankViralityScore,
  calculateViralityScore,
  calculateViralScore,
  calculateVideoMetrics,
  normalizeScore,
};
