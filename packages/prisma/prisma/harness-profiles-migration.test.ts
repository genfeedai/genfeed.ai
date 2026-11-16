import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const tableMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20261115100000_harness_profiles_table/migration.sql',
  ),
  'utf8',
);
const backfill = readFileSync(
  join(
    prismaDir,
    'migrations/20261115100100_harness_profiles_backfill/migration.sql',
  ),
  'utf8',
);

describe('harness profile table (#10191)', () => {
  it('keys the profile to its brand with a foreign key and tenant columns', () => {
    expect(schema).toContain('model HarnessProfile {');
    expect(tableMigration).toContain('"brandId" TEXT NOT NULL');
    expect(tableMigration).toContain(
      '"isDeleted" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(tableMigration).toContain(
      'ADD CONSTRAINT "harness_profiles_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id")',
    );
  });

  it('lets a brand move change the organization of its revisions and nothing else', () => {
    expect(tableMigration).toContain(
      "to_jsonb(NEW) - 'actorUserId' - 'organizationId'",
    );
  });

  it('keeps one revision per version and refuses to rewrite or delete one', () => {
    expect(tableMigration).toContain(
      'CREATE UNIQUE INDEX "harness_profile_revisions_harnessProfileId_version_key"',
    );
    expect(tableMigration).toContain(
      'BEFORE UPDATE OR DELETE ON "harness_profile_revisions"',
    );
    expect(tableMigration).toContain(
      "RAISE EXCEPTION 'harness profile revisions are append-only'",
    );
  });
});

describe('harness profile backfill (#10191)', () => {
  it('copies each profile under its own id and leaves the source rows untouched', () => {
    expect(backfill).toContain('INSERT INTO "harness_profiles"');
    expect(backfill).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(backfill).not.toMatch(
      /UPDATE\s+"profiles"|DELETE\s+FROM\s+"profiles"/u,
    );
  });

  it('only copies a profile whose brand belongs to its own organization', () => {
    expect(backfill).toContain('b."organizationId" = p."organizationId"');
  });

  it('writes revision 1 with source MIGRATION and fails when a row is lost', () => {
    expect(backfill).toContain("'MIGRATION'");
    expect(backfill).toContain('IF copied <> eligible THEN');
    expect(backfill).toContain(
      "RAISE EXCEPTION\n      'harness profile backfill lost rows",
    );
  });
});
