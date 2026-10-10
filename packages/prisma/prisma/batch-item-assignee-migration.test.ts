import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260819180000_add_batch_item_assignee/migration.sql',
  ),
  'utf8',
);

describe('batch item assignee migration (#3200)', () => {
  it('adds a nullable canonical-user assignee, renamed to TurboRunItem by #5936', () => {
    expect(schemaSource).toContain('assigneeId     String?');
    expect(schemaSource).toContain(
      '@relation("turbo_run_item_assignee", fields: [assigneeId], references: [id], onDelete: SetNull)',
    );
    expect(schemaSource).toMatch(
      /assignedTurboRunItems\s+TurboRunItem\[\]\s+@relation\("turbo_run_item_assignee"\)/,
    );
  });

  it('points the FK at users.id and never an auth-provider column', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "batch_items" ADD COLUMN "assigneeId" TEXT;',
    );
    expect(migrationSource).toContain(
      'FOREIGN KEY ("assigneeId") REFERENCES "users"("id")',
    );
    expect(migrationSource).not.toMatch(/authProvider/i);
  });

  it('indexes tenant-scoped assignee lookups and clears on user delete', () => {
    expect(migrationSource).toContain(
      'CREATE INDEX "batch_items_org_assignee_deleted_idx"',
    );
    expect(migrationSource).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
  });
});
