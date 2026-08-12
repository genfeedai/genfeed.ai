import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260812220000_typed_json_hot_columns/migration.sql',
  ),
  'utf8',
);

describe('typed JSON hot columns migration (#2519)', () => {
  it('adds BatchItem rows plus the ContentPlan / Insight scalar filter columns', () => {
    expect(schemaSource).toContain('enum BatchItemStatus');
    expect(schemaSource).toContain('model BatchItem');
    expect(schemaSource).toContain('executedCount  Int          @default(0)');
    expect(schemaSource).toContain(
      'status         String       @default("pending")',
    );
    expect(schemaSource).toContain('scheduledAt    DateTime?');
    expect(schemaSource).toContain(
      'isRead         Boolean      @default(false)',
    );
    expect(schemaSource).toContain(
      'isDismissed    Boolean      @default(false)',
    );
    expect(schemaSource).toContain(
      '@@index([organizationId, isDeleted, isRead, isDismissed, expiresAt, createdAt(sort: Desc)]',
    );
  });

  it('does not reopen sibling audit models in this migration', () => {
    expect(migrationSource).not.toContain('ad_performances');
    expect(migrationSource).not.toContain('workflow_executions');
    expect(migrationSource).not.toMatch(/ALTER TABLE "posts"/);
  });

  it('backfills filter fields from the JSON payloads it is replacing', () => {
    expect(migrationSource).toContain('SET "executedCount" = COALESCE(');
    expect(migrationSource).toContain("NULLIF(\"data\"->>'status', '')");
    expect(migrationSource).toContain("NULLIF(\"data\"->>'scheduledAt', '')");
    expect(migrationSource).toContain('"data"->>\'isRead\'');
    expect(migrationSource).toContain('"data"->>\'isDismissed\'');
    expect(migrationSource).toContain('"data"->>\'expiresAt\'');
    expect(migrationSource).toContain('jsonb_array_elements(');
    expect(migrationSource).toContain('ON CONFLICT ("id") DO NOTHING');
  });

  it('indexes the hot filters used by review, plan, and insight reads', () => {
    expect(migrationSource).toContain(
      'CREATE INDEX "content_plan_items_org_status_scheduled_idx"',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "insights_org_active_created_at_idx"',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "batch_items_org_status_review_created_idx"',
    );
  });
});
