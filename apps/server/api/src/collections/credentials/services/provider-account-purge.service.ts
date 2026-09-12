import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/**
 * Irreversibly remove provider-derived identity and connection material after
 * an authenticated provider deauthorization or data-deletion callback.
 *
 * This is intentionally the only cross-tenant credential mutation in this
 * area of the codebase. The provider's app-scoped user id carries no
 * organization id, so callers must authenticate the provider-signed request
 * before invoking it. The `(platform, externalId)` pair is the narrow global
 * identity boundary. User-authored schedules and content remain attached to
 * a sanitized, soft-deleted credential so existing foreign keys are
 * preserved.
 *
 * Split out of `CredentialsService` (a self-contained transaction that only
 * needs `prisma`) to keep that file under the runtime-complexity file-lines
 * ratchet; `CredentialsService.purgeProviderAccount` delegates here.
 */
@Injectable()
export class ProviderAccountPurgeService {
  constructor(private readonly prisma: PrismaService) {}

  async purgeProviderAccount(
    platform: CredentialPlatform,
    externalId: string,
  ): Promise<number> {
    const prismaPlatform = toPrismaCredentialPlatform(platform);
    if (!prismaPlatform || !externalId.trim()) {
      throw new TypeError('A persisted platform and external id are required');
    }

    return this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: Meta's verified app-scoped user id is the global identity boundary; the signed callback contains no organization id
      const credentials = await tx.credential.findMany({
        select: { id: true },
        where: {
          externalId: externalId.trim(),
          platform: prismaPlatform,
        },
      });
      const credentialIds = credentials.map(({ id }) => id);

      if (credentialIds.length === 0) {
        return 0;
      }

      // Analytics and provider publication identifiers were obtained from the
      // provider. Preserve the user's authored post, but remove those fields.
      // sql-risk-audit: ignore bulk-write-tenant-review -- credentialIds come only from the verified global provider identity lookup and cover live and deleted rows across organizations.
      // tenant-scope-ignore: credentialIds come only from the verified global provider identity lookup and cover live and deleted rows across organizations
      await tx.postAnalytics.deleteMany({
        where: {
          platform: prismaPlatform,
          post: { credentialId: { in: credentialIds } },
        },
      });
      // sql-risk-audit: ignore bulk-write-tenant-review -- same credentialIds bound the write; provider identity is global, not org-scoped.
      // tenant-scope-ignore: credentialIds come only from the verified global provider identity lookup and intentionally cover live and deleted rows across organizations
      await tx.post.updateMany({
        data: {
          analyticsCollectedAt: null,
          analyticsCollectionAttemptKey: null,
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionRequestedAt: null,
          analyticsCollectionState: 'unavailable',
          externalId: null,
          externalShortcode: null,
          url: null,
        },
        where: {
          credentialId: { in: credentialIds },
          platform,
        },
      });

      // sql-risk-audit: ignore bulk-write-tenant-review -- same credentialIds bound the write; provider identity is global, not org-scoped.
      // tenant-scope-ignore: credentialIds come only from the verified global provider identity lookup and intentionally sanitize live and deleted credentials across organizations
      const result = await tx.credential.updateMany({
        data: {
          accessToken: null,
          accessTokenExpiry: null,
          accessTokenSecret: null,
          externalAvatar: null,
          externalHandle: null,
          externalId: null,
          externalName: null,
          grantedScopes: [],
          grantedScopesCapturedAt: null,
          isConnected: false,
          isDeleted: true,
          oauthState: null,
          oauthToken: null,
          oauthTokenHash: null,
          oauthTokenSecret: null,
          refreshToken: null,
          refreshTokenExpiry: null,
          username: null,
          warmupAssessedAt: null,
          warmupHoldReason: null,
          warmupRiskLevel: 'unknown',
          warmupScore: 0,
          warmupSignals: {},
          warmupState: 'not_started',
        },
        where: {
          id: { in: credentialIds },
          platform: prismaPlatform,
        },
      });

      return result.count;
    });
  }
}
