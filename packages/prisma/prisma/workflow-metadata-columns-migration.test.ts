import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function statement(migration: string): string {
  return readFileSync(
    new URL(`./migrations/${migration}/migration.sql`, import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

const schema = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);

describe('workflow metadata columns', () => {
  it('declares the promoted columns on Workflow', () => {
    const model = schema.slice(
      schema.indexOf('model Workflow {'),
      schema.indexOf('@@map("workflows")'),
    );
    expect(model).toMatch(/systemWorkflowKind\s+String\?/);
    expect(model).toMatch(/systemWorkflowCanonicalId\s+String\?/);
    expect(model).toMatch(/systemWorkflowVisibility\s+String\?/);
    expect(model).toMatch(/sourceTemplateId\s+String\?/);
  });

  it('recomputes the columns whenever metadata is written', () => {
    const sql = statement('20261105120000_workflow_metadata_columns');
    expect(sql).toContain(
      `SELECT CASE WHEN jsonb_typeof(metadata #> path) = 'string' THEN metadata #>> path END`,
    );
    expect(sql).toContain(
      'CREATE TRIGGER "workflow_metadata_promotion" BEFORE INSERT OR UPDATE OF "metadata" ON "workflows" FOR EACH ROW EXECUTE FUNCTION "promote_workflow_metadata"();',
    );
  });

  it('backfills existing rows in committed batches, as the only statement', () => {
    const sql = statement('20261105120050_backfill_workflow_metadata_columns');
    expect(sql.startsWith('DO $$')).toBe(true);
    expect(sql.endsWith('$$;')).toBe(true);
    expect(sql.match(/\$\$/g)).toHaveLength(2);
    expect(sql).toContain('AND "id" <= upper_bound');
    expect(sql).toContain('LIMIT 2000');
    expect(sql).toContain('SET "metadata" = "metadata"');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain(`'workflow_metadata_columns_20261105'`);
  });

  it.each([
    [
      '20261105120100_workflow_source_template_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflows_source_template_idx" ON "workflows" ("organizationId", "sourceTemplateId") WHERE "sourceTemplateId" IS NOT NULL;',
    ],
    [
      '20261105120200_workflow_system_canonical_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflows_system_canonical_idx" ON "workflows" ("organizationId", "systemWorkflowCanonicalId") WHERE "systemWorkflowCanonicalId" IS NOT NULL;',
    ],
  ])('%s is a single concurrent index statement', (migration, expected) => {
    expect(statement(migration)).toBe(expected);
  });
});
