/** The per-post numbers a public profile shows, which Public analytics hides. */
const PUBLIC_POST_METRIC_FIELDS = [
  'avgEngagementRate',
  'totalComments',
  'totalLikes',
  'totalSaves',
  'totalShares',
  'totalViews',
] as const;

interface PostWithBrandAnalyticsSetting {
  brand?: { isPublicAnalyticsEnabled?: boolean | null } | null;
}

/**
 * A post of a brand whose owner turned Public analytics off leaves the API
 * without its metrics, so the public site has nothing to show and a client that
 * reads the response directly learns nothing either. A brand that never chose
 * (the setting is on by default) keeps them.
 */
export function withPublicPostMetricsApplied<T extends object>(post: T): T {
  const { brand } = post as PostWithBrandAnalyticsSetting;
  if (brand?.isPublicAnalyticsEnabled !== false) {
    return post;
  }
  const rest = { ...post } as Record<string, unknown>;
  for (const field of PUBLIC_POST_METRIC_FIELDS) {
    delete rest[field];
  }
  return rest as T;
}
