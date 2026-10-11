import { type CredentialPlatform, Prisma } from '@genfeedai/prisma';

export interface WinnerLatestAnalyticsScope {
  organizationId: string;
  brandId?: string;
  platform?: CredentialPlatform;
  limit: number;
}

/**
 * #5502 the latest analytics row per own post and platform, most recent
 * first. Deduplicating in SQL keeps the cap on posts, not daily snapshots, so
 * a long history cannot crowd older posts out of their account baseline.
 */
export function latestWinnerAnalyticsIds({
  organizationId,
  brandId,
  platform,
  limit,
}: WinnerLatestAnalyticsScope): Prisma.Sql {
  const brandFilter = brandId
    ? Prisma.sql`AND pa."brandId" = ${brandId} AND p."brandId" = ${brandId}`
    : Prisma.empty;
  const platformFilter = platform
    ? Prisma.sql`AND pa.platform = ${platform}::"CredentialPlatform"`
    : Prisma.empty;
  return Prisma.sql`
    SELECT latest.id
    FROM (
      SELECT DISTINCT ON (pa."postId", pa.platform) pa.id, pa.date
      FROM "post_analytics" pa
      INNER JOIN "posts" p ON p.id = pa."postId"
      WHERE pa."organizationId" = ${organizationId}
        AND pa."isDeleted" = false
        AND p."organizationId" = ${organizationId}
        ${brandFilter}
        ${platformFilter}
      ORDER BY pa."postId", pa.platform, pa."updatedAt" DESC, pa.date DESC, pa.id ASC
    ) latest
    ORDER BY latest.date DESC, latest.id DESC
    LIMIT ${limit}
  `;
}
