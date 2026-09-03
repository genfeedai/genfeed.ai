import { Prisma } from '@genfeedai/prisma';

function gainExpression(column: string, previous: string): Prisma.Sql {
  return Prisma.raw(
    `CASE WHEN ${previous} IS NULL THEN "${column}" WHEN "${column}" < ${previous} THEN 0 ELSE "${column}" - ${previous} END`,
  );
}

/**
 * Period totals from window-boundary snapshots. History is loaded through
 * `endDate` so LAG can see the pre-window snapshot; only in-window rows emit
 * gains. Counter decreases do not inflate the sum.
 */
export function analyticsPeriodTotalsSql(options: {
  brandFilter: Prisma.Sql;
  endDate: Date;
  orgFilter: Prisma.Sql;
  startDate: Date;
}): Prisma.Sql {
  return Prisma.sql`
    WITH history AS (
      SELECT
        "postId",
        "platform",
        "date",
        "totalViews",
        "totalLikes",
        "totalComments",
        "totalShares",
        "totalSaves",
        LAG("totalViews") OVER w AS prev_views,
        LAG("totalLikes") OVER w AS prev_likes,
        LAG("totalComments") OVER w AS prev_comments,
        LAG("totalShares") OVER w AS prev_shares,
        LAG("totalSaves") OVER w AS prev_saves
      FROM "post_analytics"
      WHERE "date" <= ${options.endDate}
        ${options.brandFilter}
        ${options.orgFilter}
      WINDOW w AS (PARTITION BY "postId", "platform" ORDER BY "date")
    )
    SELECT
      COALESCE(SUM(${gainExpression('totalComments', 'prev_comments')}), 0) AS total_comments,
      COALESCE(SUM(${gainExpression('totalLikes', 'prev_likes')}), 0) AS total_likes,
      COUNT(DISTINCT "postId") AS total_posts,
      COALESCE(SUM(${gainExpression('totalSaves', 'prev_saves')}), 0) AS total_saves,
      COALESCE(SUM(${gainExpression('totalShares', 'prev_shares')}), 0) AS total_shares,
      COALESCE(SUM(${gainExpression('totalViews', 'prev_views')}), 0) AS total_views,
      0 AS total_engagement
    FROM history
    WHERE "date" >= ${options.startDate}
      AND "date" <= ${options.endDate}
  `;
}

export function analyticsPeriodSeriesSql(options: {
  brandFilter: Prisma.Sql;
  endDate: Date;
  orgFilter: Prisma.Sql;
  startDate: Date;
}): Prisma.Sql {
  return Prisma.sql`
    WITH history AS (
      SELECT
        "postId",
        "platform",
        "date",
        "totalViews",
        "totalLikes",
        "totalComments",
        "totalShares",
        "totalSaves",
        LAG("totalViews") OVER w AS prev_views,
        LAG("totalLikes") OVER w AS prev_likes,
        LAG("totalComments") OVER w AS prev_comments,
        LAG("totalShares") OVER w AS prev_shares,
        LAG("totalSaves") OVER w AS prev_saves
      FROM "post_analytics"
      WHERE "date" <= ${options.endDate}
        ${options.brandFilter}
        ${options.orgFilter}
      WINDOW w AS (PARTITION BY "postId", "platform" ORDER BY "date")
    )
    SELECT
      TO_CHAR("date", 'YYYY-MM-DD') AS day,
      "platform"::text AS platform,
      SUM(${gainExpression('totalComments', 'prev_comments')}) AS comments,
      SUM(${gainExpression('totalLikes', 'prev_likes')}) AS likes,
      SUM(${gainExpression('totalSaves', 'prev_saves')}) AS saves,
      SUM(${gainExpression('totalShares', 'prev_shares')}) AS shares,
      SUM(${gainExpression('totalViews', 'prev_views')}) AS views
    FROM history
    WHERE "date" >= ${options.startDate}
      AND "date" <= ${options.endDate}
    GROUP BY TO_CHAR("date", 'YYYY-MM-DD'), "platform"
    ORDER BY day ASC
  `;
}
