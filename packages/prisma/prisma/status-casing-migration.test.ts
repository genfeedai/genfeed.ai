import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260808120000_canonicalize_draft_target_status_casing/migration.sql',
  ),
  'utf8',
);

describe('draft/target status casing migration (#2543)', () => {
  // `content_drafts` was retired in #2643, so only `campaign_targets` still has
  // a live schema column to assert. The migration assertions below stay — the
  // migration file is history and must keep describing what it did.
  it('defaults the CampaignTarget String column to the SCREAMING domain vocabulary', () => {
    expect(schemaSource).toContain(
      'status          String           @default("PENDING")',
    );
  });

  it('keeps the column String — the orphan enum types stay dropped', () => {
    expect(schemaSource).not.toMatch(/enum ContentDraftStatus/);
    expect(schemaSource).not.toMatch(/enum CampaignTargetStatus/);
  });

  it('replaces the lowercase defaults the prod reconcile left behind', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "content_drafts" ALTER COLUMN "status" SET DEFAULT \'DRAFT\';',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "campaign_targets" ALTER COLUMN "status" SET DEFAULT \'PENDING\';',
    );
  });

  it('uppercases legacy rows and stays idempotent on already-canonical data', () => {
    expect(migrationSource).toContain(
      'UPDATE "content_drafts" SET "status" = upper("status") WHERE "status" <> upper("status");',
    );
    expect(migrationSource).toContain(
      'UPDATE "campaign_targets" SET "status" = upper("status") WHERE "status" <> upper("status");',
    );
  });
});
