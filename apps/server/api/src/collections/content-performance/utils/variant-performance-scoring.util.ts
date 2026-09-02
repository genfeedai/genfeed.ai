/**
 * Canonical variant/post performance weighting (issue #166, reused by #3025).
 *
 * Blends the average performance score, average engagement rate, and view
 * volume into a single comparable score:
 *
 * `avgPerformanceScore * 0.6 + min(avgEngagementRate * 10, 100) * 0.3 + min(log10(views + 1) * 10, 30) * 0.1`
 *
 * Canonical source of this weighting is
 * `ContentRunRecommendationsService` (content-runs collection), which scores
 * content-run variants. `VariationGroupScoringService` (content-performance
 * collection) reuses it to score published source-post variation groups.
 */
export interface VariantPerformanceInputs {
  avgEngagementRate: number;
  avgPerformanceScore: number;
  totalViews: number;
}

const PERFORMANCE_WEIGHT = 0.6;
const ENGAGEMENT_WEIGHT = 0.3;
const VOLUME_WEIGHT = 0.1;
const ENGAGEMENT_CAP = 100;
const VOLUME_CAP = 30;

export function computeVariantPerformanceScore(
  inputs: VariantPerformanceInputs,
): number {
  const engagementScore = Math.min(
    inputs.avgEngagementRate * 10,
    ENGAGEMENT_CAP,
  );
  const volumeScore = Math.min(
    Math.log10(inputs.totalViews + 1) * 10,
    VOLUME_CAP,
  );

  return (
    inputs.avgPerformanceScore * PERFORMANCE_WEIGHT +
    engagementScore * ENGAGEMENT_WEIGHT +
    volumeScore * VOLUME_WEIGHT
  );
}

/**
 * Sorts by `score` descending and assigns a 1-based `rank`. Does not mutate
 * the input array.
 */
export function rankByScoreDesc<T extends { score: number }>(
  items: T[],
): Array<T & { rank: number }> {
  return [...items]
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
