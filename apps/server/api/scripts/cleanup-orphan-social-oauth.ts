/**
 * Audit and retire stale pending Threads/Fanvue OAuth credentials created by
 * the former fail-open connect ordering.
 *
 * Dry-run is the default. A tenant id is always required, including for the
 * audit, so neither reads nor writes can cross organization boundaries.
 *
 * Usage:
 *   bun run scripts/cleanup-orphan-social-oauth.ts --organization-id=<id>
 *   bun run scripts/cleanup-orphan-social-oauth.ts --organization-id=<id> --live
 *
 * Requires DATABASE_URL in the environment. Live mode performs an idempotent
 * soft delete and clears pending OAuth state/PKCE material. It never removes a
 * connected, token-bearing, identity-bearing, current, or ambiguous row.
 */

import process from 'node:process';
import { OAUTH_STATE_TTL_MS } from '@api/collections/credentials/constants/oauth.constants';
import {
  PrismaClient,
  CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('OrphanSocialOAuthCleanup');
const BATCH_SIZE = 100;
const AFFECTED_PLATFORMS: PrismaCredentialPlatform[] = [
  PrismaCredentialPlatform.FANVUE,
  PrismaCredentialPlatform.THREADS,
];

export interface OrphanSocialOAuthCleanupArgs {
  dryRun: boolean;
  organizationId: string;
}

export interface OrphanSocialOAuthCredentialRow {
  accessToken: string | null;
  accessTokenExpiry: Date | null;
  accessTokenSecret: string | null;
  externalAvatar: string | null;
  externalHandle: string | null;
  externalId: string | null;
  externalName: string | null;
  grantedScopes: string[];
  grantedScopesCapturedAt: Date | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  oauthState: string | null;
  oauthToken: string | null;
  oauthTokenHash: string | null;
  oauthTokenSecret: string | null;
  organizationId: string | null;
  platform: PrismaCredentialPlatform;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
  updatedAt: Date;
  username: string | null;
}

export interface OrphanSocialOAuthFindManyArgs {
  orderBy: { id: 'asc' };
  select: Record<keyof OrphanSocialOAuthCredentialRow, true>;
  take: number;
  where: {
    id?: { gt: string };
    isDeleted: false;
    oauthState: { not: null };
    organizationId: string;
    platform: { in: PrismaCredentialPlatform[] };
    updatedAt: { lt: Date };
  };
}

export interface OrphanSocialOAuthUpdateManyArgs {
  data: { isDeleted: true; oauthState: null; oauthToken: null };
  where: {
    OR: Array<
      | { oauthToken: null; platform: typeof PrismaCredentialPlatform.THREADS }
      | { platform: typeof PrismaCredentialPlatform.FANVUE }
    >;
    accessToken: null;
    accessTokenExpiry: null;
    accessTokenSecret: null;
    externalAvatar: null;
    externalHandle: null;
    externalId: null;
    externalName: null;
    grantedScopes: { isEmpty: true };
    grantedScopesCapturedAt: null;
    id: { in: string[] };
    isConnected: false;
    isDeleted: false;
    oauthState: { not: null };
    oauthTokenHash: null;
    oauthTokenSecret: null;
    organizationId: string;
    platform: { in: PrismaCredentialPlatform[] };
    refreshToken: null;
    refreshTokenExpiry: null;
    updatedAt: { lt: Date };
    username: null;
  };
}

export interface OrphanSocialOAuthCleanupClient {
  credential: {
    findMany(
      args: OrphanSocialOAuthFindManyArgs,
    ): Promise<readonly OrphanSocialOAuthCredentialRow[]>;
    updateMany(
      args: OrphanSocialOAuthUpdateManyArgs,
    ): Promise<{ count: number }>;
  };
}

type CleanupDisposition =
  | 'eligible'
  | 'preserve_ambiguous'
  | 'preserve_connected'
  | 'preserve_identity'
  | 'preserve_token';

export interface OrphanSocialOAuthCleanupReport {
  byDisposition: Record<CleanupDisposition, number>;
  concurrentChangesSkipped: number;
  dryRun: boolean;
  scanned: number;
  updated: number;
  wouldUpdate: number;
}

export function assertOrphanSocialOAuthCleanupCompleted(
  report: OrphanSocialOAuthCleanupReport,
): void {
  if (!report.dryRun && report.concurrentChangesSkipped > 0) {
    throw new Error(
      `Cleanup skipped ${report.concurrentChangesSkipped} concurrently changed credential(s). Rerun the dry-run and review them.`,
    );
  }
}

export function parseOrphanSocialOAuthCleanupArgs(
  args: readonly string[],
): OrphanSocialOAuthCleanupArgs {
  let dryRun = true;
  let sawDryRun = false;
  let sawLive = false;
  let organizationId: string | undefined;

  for (const arg of args) {
    if (arg === '--dry-run') {
      sawDryRun = true;
      continue;
    }
    if (arg === '--live') {
      sawLive = true;
      dryRun = false;
      continue;
    }
    if (arg.startsWith('--organization-id=')) {
      organizationId = arg.slice('--organization-id='.length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (sawDryRun && sawLive) {
    throw new Error('Choose either --dry-run or --live, not both.');
  }
  if (!organizationId) {
    throw new Error('--organization-id is required.');
  }

  return { dryRun, organizationId };
}

export function classifyOrphanSocialOAuthCredential(
  row: OrphanSocialOAuthCredentialRow,
): CleanupDisposition {
  if (row.isConnected) {
    return 'preserve_connected';
  }
  if (
    row.externalAvatar !== null ||
    row.externalHandle !== null ||
    row.externalId !== null ||
    row.externalName !== null ||
    row.username !== null
  ) {
    return 'preserve_identity';
  }
  if (
    row.accessToken !== null ||
    row.accessTokenExpiry !== null ||
    row.accessTokenSecret !== null ||
    row.grantedScopes.length > 0 ||
    row.grantedScopesCapturedAt !== null ||
    row.oauthTokenHash !== null ||
    row.oauthTokenSecret !== null ||
    row.refreshToken !== null ||
    row.refreshTokenExpiry !== null
  ) {
    return 'preserve_token';
  }
  if (
    row.isDeleted ||
    row.oauthState === null ||
    row.organizationId === null ||
    !AFFECTED_PLATFORMS.includes(row.platform) ||
    (row.platform === PrismaCredentialPlatform.THREADS &&
      row.oauthToken !== null)
  ) {
    return 'preserve_ambiguous';
  }

  // Fanvue stores its PKCE verifier in oauthToken before callback. That value
  // is pending-flow material, not a completed provider token, and is cleared by
  // the soft delete. Threads never writes oauthToken during connect.
  return 'eligible';
}

export async function runOrphanSocialOAuthCleanup(
  client: OrphanSocialOAuthCleanupClient,
  args: OrphanSocialOAuthCleanupArgs,
  now = new Date(),
): Promise<OrphanSocialOAuthCleanupReport> {
  const cutoff = new Date(now.getTime() - OAUTH_STATE_TTL_MS);
  const byDisposition: Record<CleanupDisposition, number> = {
    eligible: 0,
    preserve_ambiguous: 0,
    preserve_connected: 0,
    preserve_identity: 0,
    preserve_token: 0,
  };
  let afterId: string | undefined;
  let concurrentChangesSkipped = 0;
  let scanned = 0;
  let updated = 0;
  let wouldUpdate = 0;

  for (;;) {
    const rows = await client.credential.findMany({
      orderBy: { id: 'asc' },
      select: {
        accessToken: true,
        accessTokenExpiry: true,
        accessTokenSecret: true,
        externalAvatar: true,
        externalHandle: true,
        externalId: true,
        externalName: true,
        grantedScopes: true,
        grantedScopesCapturedAt: true,
        id: true,
        isConnected: true,
        isDeleted: true,
        oauthState: true,
        oauthToken: true,
        oauthTokenHash: true,
        oauthTokenSecret: true,
        organizationId: true,
        platform: true,
        refreshToken: true,
        refreshTokenExpiry: true,
        updatedAt: true,
        username: true,
      },
      take: BATCH_SIZE,
      where: {
        isDeleted: false,
        ...(afterId ? { id: { gt: afterId } } : {}),
        oauthState: { not: null },
        organizationId: args.organizationId,
        platform: { in: [...AFFECTED_PLATFORMS] },
        updatedAt: { lt: cutoff },
      },
    });

    if (rows.length === 0) {
      break;
    }

    scanned += rows.length;
    const eligibleIds: string[] = [];
    for (const row of rows) {
      const disposition = classifyOrphanSocialOAuthCredential(row);
      byDisposition[disposition] += 1;
      if (disposition === 'eligible') {
        eligibleIds.push(row.id);
      }
    }
    wouldUpdate += eligibleIds.length;

    if (!args.dryRun && eligibleIds.length > 0) {
      const result = await client.credential.updateMany({
        data: { isDeleted: true, oauthState: null, oauthToken: null },
        where: {
          OR: [
            {
              oauthToken: null,
              platform: PrismaCredentialPlatform.THREADS,
            },
            { platform: PrismaCredentialPlatform.FANVUE },
          ],
          accessToken: null,
          accessTokenExpiry: null,
          accessTokenSecret: null,
          externalAvatar: null,
          externalHandle: null,
          externalId: null,
          externalName: null,
          grantedScopes: { isEmpty: true },
          grantedScopesCapturedAt: null,
          id: { in: eligibleIds },
          isConnected: false,
          isDeleted: false,
          oauthState: { not: null },
          oauthTokenHash: null,
          oauthTokenSecret: null,
          organizationId: args.organizationId,
          platform: { in: [...AFFECTED_PLATFORMS] },
          refreshToken: null,
          refreshTokenExpiry: null,
          updatedAt: { lt: cutoff },
          username: null,
        },
      });
      updated += result.count;
      concurrentChangesSkipped += eligibleIds.length - result.count;
    }

    afterId = rows.at(-1)?.id;
    if (rows.length < BATCH_SIZE) {
      break;
    }
  }

  return {
    byDisposition,
    concurrentChangesSkipped,
    dryRun: args.dryRun,
    scanned,
    updated,
    wouldUpdate,
  };
}

function createCleanupClient(
  prisma: PrismaClient,
): OrphanSocialOAuthCleanupClient {
  return {
    credential: {
      findMany: (args) => prisma.credential.findMany(args),
      updateMany: (args) => prisma.credential.updateMany(args),
    },
  };
}

async function main(): Promise<void> {
  const args = parseOrphanSocialOAuthCleanupArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the OAuth cleanup.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(databaseUrl, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
    log: ['error'],
  });

  try {
    const report = await runOrphanSocialOAuthCleanup(
      createCleanupClient(prisma),
      args,
    );
    logger.log(
      `OAuth cleanup report (${args.dryRun ? 'DRY-RUN' : 'LIVE'}): ${JSON.stringify(report)}`,
    );
    if (args.dryRun && report.wouldUpdate > 0) {
      logger.log('Review the report, then rerun with --live to apply.');
    }
    assertOrphanSocialOAuthCleanupCompleted(report);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    logger.error(
      'Orphan social OAuth cleanup failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
}
