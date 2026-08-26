import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import {
  assertOrphanSocialOAuthCleanupCompleted,
  type OrphanSocialOAuthCleanupClient,
  type OrphanSocialOAuthCredentialRow,
  type OrphanSocialOAuthFindManyArgs,
  type OrphanSocialOAuthUpdateManyArgs,
  parseOrphanSocialOAuthCleanupArgs,
  runOrphanSocialOAuthCleanup,
} from './cleanup-orphan-social-oauth';

const ORGANIZATION_ID = 'organization-1';
const NOW = new Date('2026-08-26T12:00:00.000Z');
const STALE_AT = new Date('2026-08-26T11:00:00.000Z');

function pendingRow(
  overrides: Partial<OrphanSocialOAuthCredentialRow> = {},
): OrphanSocialOAuthCredentialRow {
  return {
    accessToken: null,
    accessTokenExpiry: null,
    accessTokenSecret: null,
    externalAvatar: null,
    externalHandle: null,
    externalId: null,
    externalName: null,
    grantedScopes: [],
    grantedScopesCapturedAt: null,
    id: 'credential-1',
    isConnected: false,
    isDeleted: false,
    oauthState: 'pending-state',
    oauthToken: null,
    oauthTokenHash: null,
    oauthTokenSecret: null,
    organizationId: ORGANIZATION_ID,
    platform: PrismaCredentialPlatform.THREADS,
    refreshToken: null,
    refreshTokenExpiry: null,
    updatedAt: STALE_AT,
    username: null,
    ...overrides,
  };
}

class FakeCleanupClient implements OrphanSocialOAuthCleanupClient {
  readonly findCalls: OrphanSocialOAuthFindManyArgs[] = [];
  readonly updateCalls: OrphanSocialOAuthUpdateManyArgs[] = [];
  readonly credential = {
    findMany: async (args: OrphanSocialOAuthFindManyArgs) => {
      this.findCalls.push(args);
      return this.rows
        .filter(
          (row) =>
            row.organizationId === args.where.organizationId &&
            row.isDeleted === false &&
            row.oauthState !== null &&
            args.where.platform.in.includes(row.platform) &&
            row.updatedAt.getTime() < args.where.updatedAt.lt.getTime() &&
            (!args.where.id || row.id > args.where.id.gt),
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, args.take)
        .map((row) => ({ ...row }));
    },
    updateMany: async (args: OrphanSocialOAuthUpdateManyArgs) => {
      this.updateCalls.push(args);
      let count = 0;
      for (const row of this.rows) {
        if (
          args.where.id.in.includes(row.id) &&
          row.organizationId === args.where.organizationId &&
          row.isDeleted === false &&
          row.oauthState !== null &&
          row.isConnected === false &&
          row.externalId === null &&
          row.accessToken === null &&
          row.refreshToken === null
        ) {
          row.isDeleted = true;
          row.oauthState = null;
          row.oauthToken = null;
          count += 1;
        }
      }
      return { count };
    },
  };

  constructor(private readonly rows: OrphanSocialOAuthCredentialRow[]) {}
}

describe('cleanup-orphan-social-oauth', () => {
  it('defaults to tenant-scoped dry-run mode and rejects unsafe arguments', () => {
    expect(
      parseOrphanSocialOAuthCleanupArgs([
        `--organization-id=${ORGANIZATION_ID}`,
      ]),
    ).toEqual({ dryRun: true, organizationId: ORGANIZATION_ID });
    expect(
      parseOrphanSocialOAuthCleanupArgs([
        '--live',
        `--organization-id=${ORGANIZATION_ID}`,
      ]),
    ).toEqual({ dryRun: false, organizationId: ORGANIZATION_ID });
    expect(() => parseOrphanSocialOAuthCleanupArgs([])).toThrow(
      '--organization-id is required',
    );
    expect(() =>
      parseOrphanSocialOAuthCleanupArgs([
        '--live',
        '--dry-run',
        `--organization-id=${ORGANIZATION_ID}`,
      ]),
    ).toThrow('Choose either --dry-run or --live');
    expect(() =>
      parseOrphanSocialOAuthCleanupArgs([
        '--unknown',
        `--organization-id=${ORGANIZATION_ID}`,
      ]),
    ).toThrow('Unknown argument');
  });

  it('audits eligible rows while preserving completed and ambiguous credentials', async () => {
    const client = new FakeCleanupClient([
      pendingRow({ id: 'eligible-threads' }),
      pendingRow({
        id: 'eligible-fanvue',
        oauthToken: 'encrypted-pkce-verifier',
        platform: PrismaCredentialPlatform.FANVUE,
      }),
      pendingRow({ id: 'connected', isConnected: true }),
      pendingRow({ accessToken: 'encrypted-access', id: 'token-bearing' }),
      pendingRow({ externalId: 'threads-user', id: 'identity-bearing' }),
      pendingRow({ id: 'ambiguous', oauthToken: 'unexpected-threads-token' }),
      pendingRow({
        id: 'foreign-tenant',
        organizationId: 'organization-2',
      }),
    ]);

    const report = await runOrphanSocialOAuthCleanup(
      client,
      { dryRun: true, organizationId: ORGANIZATION_ID },
      NOW,
    );

    expect(report).toEqual({
      byDisposition: {
        eligible: 2,
        preserve_ambiguous: 1,
        preserve_connected: 1,
        preserve_identity: 1,
        preserve_token: 1,
      },
      concurrentChangesSkipped: 0,
      dryRun: true,
      scanned: 6,
      updated: 0,
      wouldUpdate: 2,
    });
    expect(client.updateCalls).toHaveLength(0);
    expect(client.findCalls[0]?.where).toMatchObject({
      isDeleted: false,
      oauthState: { not: null },
      organizationId: ORGANIZATION_ID,
      platform: {
        in: [PrismaCredentialPlatform.FANVUE, PrismaCredentialPlatform.THREADS],
      },
      updatedAt: { lt: new Date('2026-08-26T11:45:00.000Z') },
    });
  });

  it('soft-deletes only eligible rows with race-safe guards and is idempotent', async () => {
    const client = new FakeCleanupClient([
      pendingRow({ id: 'eligible-threads' }),
      pendingRow({
        id: 'eligible-fanvue',
        oauthToken: 'encrypted-pkce-verifier',
        platform: PrismaCredentialPlatform.FANVUE,
      }),
      pendingRow({ id: 'connected', isConnected: true }),
      pendingRow({ refreshToken: 'encrypted-refresh', id: 'token-bearing' }),
      pendingRow({ externalHandle: 'creator', id: 'identity-bearing' }),
    ]);

    const first = await runOrphanSocialOAuthCleanup(
      client,
      { dryRun: false, organizationId: ORGANIZATION_ID },
      NOW,
    );
    const second = await runOrphanSocialOAuthCleanup(
      client,
      { dryRun: false, organizationId: ORGANIZATION_ID },
      NOW,
    );

    expect(first).toMatchObject({
      concurrentChangesSkipped: 0,
      updated: 2,
      wouldUpdate: 2,
    });
    expect(second).toMatchObject({ updated: 0, wouldUpdate: 0 });
    expect(client.updateCalls[0]).toMatchObject({
      data: { isDeleted: true, oauthState: null, oauthToken: null },
      where: {
        accessToken: null,
        externalId: null,
        id: { in: ['eligible-fanvue', 'eligible-threads'] },
        isConnected: false,
        isDeleted: false,
        organizationId: ORGANIZATION_ID,
        refreshToken: null,
      },
    });
  });

  it('paginates large tenant audits and cleanup writes', async () => {
    const client = new FakeCleanupClient(
      Array.from({ length: 105 }, (_, index) =>
        pendingRow({ id: `eligible-${String(index).padStart(3, '0')}` }),
      ),
    );

    const report = await runOrphanSocialOAuthCleanup(
      client,
      { dryRun: false, organizationId: ORGANIZATION_ID },
      NOW,
    );

    expect(report).toMatchObject({ scanned: 105, updated: 105 });
    expect(client.findCalls).toHaveLength(2);
    expect(client.updateCalls).toHaveLength(2);
    expect(client.updateCalls[0]?.where.id.in).toHaveLength(100);
    expect(client.updateCalls[1]?.where.id.in).toHaveLength(5);
  });

  it('fails live cleanup when a concurrent change prevents a guarded update', () => {
    expect(() =>
      assertOrphanSocialOAuthCleanupCompleted({
        byDisposition: {
          eligible: 1,
          preserve_ambiguous: 0,
          preserve_connected: 0,
          preserve_identity: 0,
          preserve_token: 0,
        },
        concurrentChangesSkipped: 1,
        dryRun: false,
        scanned: 1,
        updated: 0,
        wouldUpdate: 1,
      }),
    ).toThrow('Cleanup skipped 1 concurrently changed credential');
  });
});
