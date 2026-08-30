import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const createMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20260822130000_add_x_ad_watched_advertisers/migration.sql',
  ),
  'utf8',
);
const generalizeMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20260825120000_generalize_ad_watched_advertisers/migration.sql',
  ),
  'utf8',
);

describe('ad_watched_advertisers tenant and brand invariants (#3395, #3537)', () => {
  it('adds scalar provenance used to keep tenant snapshots fresh and private', () => {
    for (const column of [
      'researchSource',
      'researchSnapshotKey',
      'researchSnapshotId',
      'researchFreshnessState',
      'researchObservedAt',
    ]) {
      expect(schema).toContain(column);
      expect(createMigration).toContain(`"${column}"`);
    }
    expect(createMigration).toContain(
      '"ad_performance_research_snapshot_visibility_idx"',
    );
  });

  it('binds a selected brand to the same organization at the database boundary', () => {
    expect(schema).toContain(
      '@relation(fields: [brandId, organizationId], references: [id, organizationId]',
    );
    expect(createMigration).toContain(
      'FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")',
    );
    expect(generalizeMigration).toContain(
      'TO "ad_watched_advertisers_brandId_organizationId_fkey"',
    );
  });

  it('stores safe snapshot freshness separately from attempts', () => {
    for (const column of [
      'freshnessState',
      'lastAttemptedAt',
      'lastSuccessfulAt',
      'lastIngestionErrorCode',
      'lastSnapshotId',
      'lastSnapshotRecordCount',
    ]) {
      expect(schema).toContain(column);
      expect(createMigration).toContain(`"${column}"`);
    }
    expect(schema).not.toContain('lastIngestionError   String?');
  });
});

describe('ad_watched_advertisers generalization to every ad platform (#3537)', () => {
  it('renames the X-only table rather than leaving a second watchlist behind', () => {
    expect(generalizeMigration).toContain(
      'ALTER TABLE "x_ad_watched_advertisers" RENAME TO "ad_watched_advertisers"',
    );
    expect(schema).toContain('model AdWatchedAdvertiser {');
    expect(schema).toContain('@@map("ad_watched_advertisers")');
    expect(schema).not.toContain('model XAdWatchedAdvertiser {');
  });

  it('carries the pre-rename rows onto their real platform instead of leaving them unattributed', () => {
    expect(generalizeMigration).toContain(
      'ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT \'x\'',
    );
    expect(schema).toContain(
      'platform                String       @default("x")',
    );
  });

  it('constrains platform to the archives Genfeed can actually resolve', () => {
    expect(generalizeMigration).toContain(
      'CONSTRAINT "ad_watched_advertisers_platform_check"',
    );
    for (const platform of ['meta', 'google', 'youtube', 'tiktok', 'x']) {
      expect(generalizeMigration).toContain(`'${platform}'`);
    }
  });

  it('replaces the X screen-name handle rule with a platform-agnostic normalization invariant', () => {
    expect(generalizeMigration).toContain(
      'DROP CONSTRAINT IF EXISTS "x_ad_watched_advertisers_handle_check"',
    );
    expect(generalizeMigration).toContain(
      'CONSTRAINT "ad_watched_advertisers_handle_check"',
    );
    expect(generalizeMigration).toContain(
      '"advertiserHandle" = lower("advertiserHandle")',
    );
    expect(generalizeMigration).toContain("'^[a-z0-9._-]{1,64}$'");
    expect(generalizeMigration).not.toContain("'^[a-z0-9_]{1,15}$'");
  });

  it('makes uniqueness per platform so one advertiser can be watched on Meta and TikTok at once', () => {
    expect(generalizeMigration).toContain(
      'DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_brand_handle_key"',
    );
    expect(generalizeMigration).toContain(
      'DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_unbranded_handle_key"',
    );
    expect(generalizeMigration).toContain(
      '"ad_watched_advertisers_org_brand_platform_handle_key"',
    );
    expect(generalizeMigration).toContain(
      'ON "ad_watched_advertisers" ("organizationId", "brandId", "platform", "advertiserHandle")',
    );
    expect(generalizeMigration).toContain('WHERE "brandId" IS NOT NULL');
    expect(generalizeMigration).toContain(
      '"ad_watched_advertisers_org_unbranded_platform_handle_key"',
    );
    expect(generalizeMigration).toContain(
      'ON "ad_watched_advertisers" ("organizationId", "platform", "advertiserHandle")',
    );
    expect(generalizeMigration).toContain('WHERE "brandId" IS NULL');
  });

  it('maps every Prisma-declared index to the migration name', () => {
    for (const indexName of [
      'ad_watched_advertisers_org_deleted_created_at_idx',
      'ad_watched_advertisers_org_brand_platform_deleted_idx',
      'ad_watched_advertisers_deleted_platform_last_attempted_idx',
    ]) {
      expect(schema).toContain(`map: "${indexName}"`);
      expect(generalizeMigration).toContain(`"${indexName}"`);
    }
    expect(schema).not.toContain('x_ad_watched_advertisers');
  });
});
