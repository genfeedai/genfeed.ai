import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260822130000_add_x_ad_watched_advertisers/migration.sql',
  ),
  'utf8',
);

describe('x_ad_watched_advertisers tenant and brand invariants (#3395)', () => {
  it('adds scalar provenance used to keep tenant snapshots fresh and private', () => {
    for (const column of [
      'researchSource',
      'researchSnapshotKey',
      'researchSnapshotId',
      'researchFreshnessState',
      'researchObservedAt',
    ]) {
      expect(schema).toContain(column);
      expect(migration).toContain(`"${column}"`);
    }
    expect(migration).toContain(
      '"ad_performance_research_snapshot_visibility_idx"',
    );
  });

  it('keeps same-handle watch rows independent per brand and for the organization fallback', () => {
    expect(migration).toContain(
      '"x_ad_watched_advertisers_org_brand_handle_key"',
    );
    expect(migration).toContain(
      'ON "x_ad_watched_advertisers" ("organizationId", "brandId", "advertiserHandle")',
    );
    expect(migration).toContain('WHERE "brandId" IS NOT NULL');
    expect(migration).toContain(
      '"x_ad_watched_advertisers_org_unbranded_handle_key"',
    );
    expect(migration).toContain(
      'ON "x_ad_watched_advertisers" ("organizationId", "advertiserHandle")',
    );
    expect(migration).toContain('WHERE "brandId" IS NULL');
    expect(migration).not.toContain(
      '"x_ad_watched_advertisers_org_handle_key"',
    );
  });

  it('binds a selected brand to the same organization at the database boundary', () => {
    expect(schema).toContain(
      '@relation(fields: [brandId, organizationId], references: [id, organizationId]',
    );
    expect(migration).toContain(
      'CONSTRAINT "x_ad_watched_advertisers_brandId_organizationId_fkey"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")',
    );
  });

  it('stores safe snapshot freshness separately from attempts and enforces canonical handles', () => {
    for (const column of [
      'freshnessState',
      'lastAttemptedAt',
      'lastSuccessfulAt',
      'lastIngestionErrorCode',
      'lastSnapshotId',
      'lastSnapshotRecordCount',
    ]) {
      expect(schema).toContain(column);
      expect(migration).toContain(`"${column}"`);
    }
    expect(schema).not.toContain('lastIngestionError   String?');
    expect(migration).toContain(
      'CONSTRAINT "x_ad_watched_advertisers_handle_check"',
    );
    expect(migration).toContain("'^[a-z0-9_]{1,15}$'");
  });

  it('maps every Prisma-declared index to the migration name', () => {
    expect(schema).toContain(
      'map: "x_ad_watched_advertisers_org_deleted_created_at_idx"',
    );
    expect(schema).toContain(
      'map: "x_ad_watched_advertisers_org_brand_deleted_idx"',
    );
    expect(schema).toContain(
      'map: "x_ad_watched_advertisers_deleted_last_attempted_idx"',
    );
  });
});
