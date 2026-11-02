import type {
  IEntityAnalyticsStats,
  IEntityStatsTotals,
} from '@genfeedai/contracts/interfaces';

export const EMPTY_ENTITY_TOTALS: IEntityStatsTotals = {
  growth: 0,
  totalEngagement: 0,
  totalPosts: 0,
  totalViews: 0,
};

/** Per-entity maps for one period, as the leaderboard aggregations return them. */
export interface EntityTotalsInput {
  current: Map<string, IEntityAnalyticsStats>;
  previousEngagement: Map<string, number>;
  publishedPosts: Map<string, number>;
}

function sumValues(values: Iterable<number>): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
}

/** Sum the per-entity figures into one total; `growth` compares engagement with the previous period. */
export function sumEntityTotals(
  { current, previousEngagement, publishedPosts }: EntityTotalsInput,
  growth: (current: number, previous: number) => number,
): IEntityStatsTotals {
  const stats = [...current.values()];
  const totalEngagement = sumValues(stats.map((row) => row.totalEngagement));
  return {
    growth: growth(totalEngagement, sumValues(previousEngagement.values())),
    totalEngagement,
    totalPosts: sumValues(publishedPosts.values()),
    totalViews: sumValues(stats.map((row) => row.totalViews)),
  };
}
