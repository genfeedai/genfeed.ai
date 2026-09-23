import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import {
  OAUTH_CLIENT_CLEANUP_BATCH_SIZE,
  OAUTH_CLIENT_CLEANUP_RETENTION_DAYS,
} from '@workers/crons/oauth-client-cleanup/oauth-client-cleanup.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Deletes dynamically registered OAuth clients that never completed a sign-in.
 *
 * `POST /v1/oauth/register` is public and creates one row per call (#4954
 * raised the per-IP limit to 60/min for hosted MCP clients). A client that
 * never reached token exchange owns no refresh token, and its one-time codes
 * are removed by the authorize TTL cleanup. Refresh tokens are revoked, never
 * deleted, so any client that ever signed in is retained (#4957).
 */
@Injectable()
export class CronOAuthClientCleanupService {
  private readonly context = 'CronOAuthClientCleanupService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async deleteAbandonedClients(now = new Date()): Promise<number> {
    const cutoff = CronOAuthClientCleanupService.cutoffFrom(now);
    const abandoned = abandonedClientWhere(cutoff);
    let deleted = 0;

    while (true) {
      const batch = await this.prisma.oAuthClient.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: OAUTH_CLIENT_CLEANUP_BATCH_SIZE,
        where: abandoned,
      });

      if (batch.length === 0) {
        break;
      }

      // sql-risk-audit: ignore bulk-write-tenant-review -- Global cleanup of pre-auth OAuth clients (no org owner) that never obtained a code or refresh token.
      const result = await this.prisma.oAuthClient.deleteMany({
        where: {
          ...abandoned,
          id: { in: batch.map((client) => client.id) },
        },
      });
      deleted += result.count;

      // A full page that deletes nothing will select the same rows again.
      // Concurrent sign-in can make every selected client ineligible between
      // findMany and deleteMany; stop instead of spinning on that page.
      if (
        result.count === 0 ||
        batch.length < OAUTH_CLIENT_CLEANUP_BATCH_SIZE
      ) {
        break;
      }
    }

    this.logger.log('CronOAuthClientCleanupService completed', {
      context: this.context,
      cutoff: cutoff.toISOString(),
      deleted,
      retentionDays: OAUTH_CLIENT_CLEANUP_RETENTION_DAYS,
    });

    return deleted;
  }

  static cutoffFrom(now: Date): Date {
    return new Date(
      now.getTime() - OAUTH_CLIENT_CLEANUP_RETENTION_DAYS * MS_PER_DAY,
    );
  }
}

function abandonedClientWhere(cutoff: Date) {
  return {
    authCodes: { none: {} },
    createdAt: { lt: cutoff },
    refreshTokens: { none: {} },
  };
}
