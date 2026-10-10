import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261010200000_rename_batch_to_turbo/migration.sql',
  ),
  'utf8',
);

describe('Batch to Turbo rename migration (#5936)', () => {
  it('renames the four tables, their enums and columns in place', () => {
    for (const [from, to] of [
      ['batches', 'turbo_runs'],
      ['batch_items', 'turbo_run_items'],
      ['batch_projects', 'turbo_projects'],
      ['batch_project_items', 'turbo_project_items'],
    ]) {
      expect(migrationSource).toContain(
        `ALTER TABLE "${from}" RENAME TO "${to}";`,
      );
      expect(schemaSource).toContain(`@@map("${to}")`);
      expect(schemaSource).not.toContain(`@@map("${from}")`);
    }
    for (const [from, to] of [
      ['BatchStatus', 'TurboRunStatus'],
      ['BatchItemStatus', 'TurboRunItemStatus'],
      ['BatchProjectKind', 'TurboProjectKind'],
      ['BatchProjectStatus', 'TurboProjectStatus'],
      ['BatchProjectItemStatus', 'TurboProjectItemStatus'],
    ]) {
      expect(migrationSource).toContain(
        `ALTER TYPE "${from}" RENAME TO "${to}";`,
      );
      expect(schemaSource).toContain(`enum ${to} {`);
    }
    expect(migrationSource).toContain(
      'ALTER TABLE "turbo_run_items" RENAME COLUMN "batchId" TO "turboRunId";',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "posts" RENAME COLUMN "reviewBatchId" TO "reviewTurboRunId";',
    );
    expect(schemaSource).not.toMatch(/\bmodel Batch|\benum Batch/);
  });

  it('leaves no constraint or index named for the old tables', () => {
    const renamedTargets = [...migrationSource.matchAll(/ TO "([^"]+)";/g)].map(
      (match) => match[1],
    );
    const oldNames = [
      ...migrationSource.matchAll(
        /(?:CONSTRAINT|INDEX) "((?:batches|batch_)[^"]+)"/g,
      ),
    ].map((match) => match[1]);

    expect(oldNames.length).toBeGreaterThanOrEqual(27);
    for (const name of renamedTargets) {
      expect(name).not.toMatch(/batch/);
    }
  });

  it('aborts when any renamed table changes row count', () => {
    expect(migrationSource).toContain(
      'CREATE TEMP TABLE "_turbo_rename_counts"',
    );
    expect(migrationSource).toContain(
      "RAISE EXCEPTION 'Turbo rename changed row counts; aborting'",
    );
  });

  it('rewrites the stored references the application reads', () => {
    for (const target of [
      'UPDATE "agent_messages" SET "metadata"',
      'UPDATE "content_runs" SET "config"',
      'UPDATE "posts" SET "targetSettings"',
      'UPDATE "organization_settings"',
      'UPDATE "platform_settings"',
      'UPDATE "credit_transactions"',
    ]) {
      expect(migrationSource).toContain(target);
    }
    expect(migrationSource).toContain('\'"batchId":\', \'"turboRunId":\'');
    expect(migrationSource).toContain(
      '\'"batch_generation_result_card"\', \'"turbo_run_result_card"\'',
    );
    expect(migrationSource).toContain("jsonb_build_object('turbo', ");
    expect(migrationSource).toContain("jsonb_build_object('turbo_ideas', ");
    expect(migrationSource).toContain("jsonb_build_object('studio_turbo', ");
  });

  it('never rewrites integrity-protected history', () => {
    expect(migrationSource).not.toMatch(
      /UPDATE "(workflow_versions|workflow_executions|agent_transfers|mcp_approvals)"/,
    );
  });
});
