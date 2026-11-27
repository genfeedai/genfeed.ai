import { Prisma, type PrismaClient } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

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

/** A post's totals as of its latest analytics day. */
export interface PublicPostMetrics {
  /** Percent of views that engaged, as stored on the analytics row. */
  avgEngagementRate: number;
  totalComments: number;
  totalLikes: number;
  totalSaves: number;
  totalShares: number;
  totalViews: number;
}

interface PostWithAnalyticsScope extends PostWithBrandAnalyticsSetting {
  id?: string;
}

/**
 * Whether a post's metrics may be read at all. A brand that turned Public
 * analytics off is skipped before the read, so its numbers never leave the
 * database.
 */
function isMetricsPublic(post: PostWithAnalyticsScope): boolean {
  return post.brand?.isPublicAnalyticsEnabled !== false;
}

/**
 * The latest analytics row of each post, in one query for the whole page. The
 * columns hold running totals (the `*Increment` columns hold the day's change),
 * so the newest day alone is the post's count. A post with no row is absent
 * from the result, which is how a post with no analytics yet stays without
 * counts instead of showing zero.
 */
export const loadPublicPostMetrics = traced(
  'loadPublicPostMetrics',
  async (
    prisma: Pick<PrismaClient, '$queryRaw'>,
    posts: readonly PostWithAnalyticsScope[],
  ): Promise<Map<string, PublicPostMetrics>> => {
    const ids = [
      ...new Set(
        posts.flatMap((post) =>
          post.id && isMetricsPublic(post) ? [post.id] : [],
        ),
      ),
    ];
    if (ids.length === 0) {
      return new Map();
    }
    // sql-risk-audit: ignore raw-sql-review -- Primary-key lookup of the post ids of one public page, already filtered to public, undeleted posts of public brands with Public analytics on; reads only totals from rows with isDeleted = false.
    const rows = await prisma.$queryRaw<
      (PublicPostMetrics & { engagementRate: number; postId: string })[]
    >(Prisma.sql`
    SELECT DISTINCT ON ("postId")
           "postId", "totalViews", "totalLikes", "totalComments",
           "totalShares", "totalSaves", "engagementRate"
    FROM "post_analytics"
    WHERE "postId" IN (${Prisma.join(ids)})
      AND "isDeleted" = false
    ORDER BY "postId", "date" DESC, "updatedAt" DESC`);
    return new Map(
      rows.map((row) => [
        row.postId,
        {
          avgEngagementRate: row.engagementRate,
          totalComments: row.totalComments,
          totalLikes: row.totalLikes,
          totalSaves: row.totalSaves,
          totalShares: row.totalShares,
          totalViews: row.totalViews,
        },
      ]),
    );
  },
);

/** The post with its measured totals, or unchanged when it has none. */
export function withPostMetrics<T extends PostWithAnalyticsScope>(
  post: T,
  metricsByPostId: ReadonlyMap<string, PublicPostMetrics>,
): T {
  const metrics = post.id ? metricsByPostId.get(post.id) : undefined;
  return metrics ? { ...post, ...metrics } : post;
}
