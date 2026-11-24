import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IPublicBrandReach } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

interface PublicBrandReachRow {
  engagements: bigint | number | null;
  impressions: bigint | number | null;
  views: bigint | number | null;
}

/**
 * Each post and platform keeps one cumulative snapshot per day, so the
 * lifetime total is the latest snapshot of every post and platform, summed.
 * Summing every row would count a post once per day. Soft-deleted posts and
 * snapshots are left out. Impressions stay NULL when no platform reported any.
 */
function publicBrandReachSql(options: {
  brandId: string;
  organizationId: string;
}): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COALESCE(SUM(latest."totalViews"), 0) AS views,
      COALESCE(SUM(
        latest."totalLikes" + latest."totalComments"
          + latest."totalShares" + latest."totalSaves"
      ), 0) AS engagements,
      SUM(latest."impressions") AS impressions
    FROM (
      SELECT DISTINCT ON (pa."postId", pa."platform")
        pa."totalViews", pa."totalLikes", pa."totalComments",
        pa."totalShares", pa."totalSaves", pa."impressions"
      FROM "post_analytics" pa
      JOIN "posts" p ON p."id" = pa."postId" AND p."isDeleted" = false
      WHERE pa."brandId" = ${options.brandId}
        AND pa."organizationId" = ${options.organizationId}
        AND pa."isDeleted" = false
      ORDER BY pa."postId", pa."platform", pa."date" DESC
    ) latest
  `;
}

function toCount(value: bigint | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** The aggregate row as the public contract: plain numbers, null when absent. */
function toPublicBrandReach(
  row: PublicBrandReachRow | undefined,
): IPublicBrandReach {
  return {
    engagements: toCount(row?.engagements),
    impressions: toCount(row?.impressions),
    views: toCount(row?.views),
  };
}

/**
 * The totals a public profile shows. Only sums leave the analytics rows: no
 * post, platform or account is named.
 */
@Traced()
@Injectable()
export class PublicBrandReachService {
  constructor(private readonly prisma: PrismaService) {}

  async findForBrand(
    brandId: string,
    organizationId: string,
  ): Promise<IPublicBrandReach> {
    // sql-risk-audit: ignore raw-sql-review -- Filtered by brandId and organizationId on the (brandId, date) index; one brand's snapshots only, and the public route caches the answer for 30 minutes. Verified against PostgreSQL in public-brand-reach.postgres.spec.ts.
    const rows = await this.prisma.$queryRaw<PublicBrandReachRow[]>(
      publicBrandReachSql({ brandId, organizationId }),
    );
    return toPublicBrandReach(rows[0]);
  }
}
