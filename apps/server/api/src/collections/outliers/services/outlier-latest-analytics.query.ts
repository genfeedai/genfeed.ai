import type { OutlierResolvedAccount } from '@genfeedai/contracts/interfaces';
import { type CredentialPlatform, Prisma } from '@genfeedai/prisma';

export function latestOutlierAnalyticsIds(
  scope: OutlierResolvedAccount,
  platform: CredentialPlatform,
  offset: number,
): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (pa."postId") pa.id
    FROM "post_analytics" pa
    INNER JOIN "posts" p ON p.id = pa."postId"
    WHERE pa."organizationId" = ${scope.organizationId}
      AND pa."brandId" = ${scope.brandId}
      AND pa."isDeleted" = false
      AND p."organizationId" = ${scope.organizationId}
      AND p."brandId" = ${scope.brandId}
      AND p."isDeleted" = false
      AND pa.platform = ${platform}::"CredentialPlatform"
      AND (p.platform = ${scope.platform} OR p.platform IS NULL)
      AND (pa."credentialId" = ${scope.accountId}
        OR (pa."credentialId" IS NULL AND p."credentialId" = ${scope.accountId}))
    ORDER BY pa."postId", pa."updatedAt" DESC, pa.date DESC, pa.id ASC
    LIMIT 200 OFFSET ${offset}
  `;
}
